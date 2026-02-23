-- ============================================================================
-- EXTEND MULTI-TENANCY TO: annual_targets, historical_stats,
--                          master_options, dropdown_options
-- ============================================================================
-- This migration adds company_id to 4 remaining global tables so that each
-- subsidiary can have its own targets, historical data, and dropdown options.
-- ============================================================================

-- ─── 1. ADD company_id COLUMN ───────────────────────────────────────────────

ALTER TABLE public.annual_targets
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE public.historical_stats
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE public.master_options
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE public.dropdown_options
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);


-- ─── 2. BACKFILL EXISTING DATA WITH WERKUDARA ──────────────────────────────

DO $$
DECLARE
    werkudara_id uuid;
BEGIN
    SELECT id INTO werkudara_id FROM public.companies WHERE name = 'Werkudara' LIMIT 1;

    IF werkudara_id IS NOT NULL THEN
        UPDATE public.annual_targets   SET company_id = werkudara_id WHERE company_id IS NULL;
        UPDATE public.historical_stats SET company_id = werkudara_id WHERE company_id IS NULL;
        UPDATE public.master_options   SET company_id = werkudara_id WHERE company_id IS NULL;
        UPDATE public.dropdown_options SET company_id = werkudara_id WHERE company_id IS NULL;
    END IF;
END $$;


-- ─── 3. SET NOT NULL ────────────────────────────────────────────────────────

ALTER TABLE public.annual_targets   ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.historical_stats ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.master_options   ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.dropdown_options ALTER COLUMN company_id SET NOT NULL;


-- ─── 4. FIX PRIMARY KEY AND UNIQUE CONSTRAINTS ─────────────────────────────

-- annual_targets: PK was just (year). Now it must be (year, company_id)
-- so each subsidiary can have its own target per year.
ALTER TABLE public.annual_targets DROP CONSTRAINT IF EXISTS annual_targets_pkey;
ALTER TABLE public.annual_targets
    ADD CONSTRAINT annual_targets_pkey PRIMARY KEY (year, company_id);

-- historical_stats: unique was (department_code, year, month).
-- Department codes may overlap across companies, so add company_id.
ALTER TABLE public.historical_stats
    DROP CONSTRAINT IF EXISTS historical_stats_department_code_year_month_key;
ALTER TABLE public.historical_stats
    ADD CONSTRAINT historical_stats_dept_year_month_company_key
    UNIQUE (department_code, year, month, company_id);


-- ─── 5. ENABLE RLS AND CREATE TENANT ISOLATION POLICIES ────────────────────

-- annual_targets
ALTER TABLE public.annual_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation for Annual Targets" ON public.annual_targets;
CREATE POLICY "Tenant Isolation for Annual Targets" ON public.annual_targets
    FOR ALL
    USING (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin')
    WITH CHECK (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin');

-- historical_stats
DROP POLICY IF EXISTS "Tenant Isolation for Historical Stats" ON public.historical_stats;
CREATE POLICY "Tenant Isolation for Historical Stats" ON public.historical_stats
    FOR ALL
    USING (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin')
    WITH CHECK (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin');

-- master_options
ALTER TABLE public.master_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation for Master Options" ON public.master_options;
CREATE POLICY "Tenant Isolation for Master Options" ON public.master_options
    FOR ALL
    USING (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin')
    WITH CHECK (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin');

-- dropdown_options
ALTER TABLE public.dropdown_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation for Dropdown Options" ON public.dropdown_options;
CREATE POLICY "Tenant Isolation for Dropdown Options" ON public.dropdown_options
    FOR ALL
    USING (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin')
    WITH CHECK (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin');


-- ─── 6. UPDATE upsert_master_options RPC TO BE COMPANY-AWARE ────────────────

CREATE OR REPLACE FUNCTION public.upsert_master_options(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_item      JSONB;
    v_inserted  INT := 0;
    v_updated   INT := 0;
    v_skipped   INT := 0;
    v_category  TEXT;
    v_label     TEXT;
    v_value     TEXT;
    v_sort      INT;
    v_active    BOOLEAN;
    v_company   UUID;
    v_existing  UUID;
    v_auth_company UUID;
BEGIN
    -- Get the caller's company_id for stamping new records
    v_auth_company := public.get_auth_company_id();

    -- Validate input is a JSON array
    IF jsonb_typeof(p_items) != 'array' THEN
        RAISE EXCEPTION 'Input must be a JSON array, got: %', jsonb_typeof(p_items);
    END IF;

    -- Process each item in the array
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Extract fields with validation
        v_category := v_item ->> 'category';
        v_label    := v_item ->> 'label';
        v_value    := v_item ->> 'value';
        v_sort     := COALESCE((v_item ->> 'sort_order')::INT, 0);
        v_active   := COALESCE((v_item ->> 'is_active')::BOOLEAN, TRUE);
        -- Allow explicit company_id from payload, otherwise use auth company
        v_company  := COALESCE((v_item ->> 'company_id')::UUID, v_auth_company);

        -- Skip rows missing required fields
        IF v_category IS NULL OR v_category = '' OR v_label IS NULL OR v_label = '' THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Auto-generate value from label if not provided
        IF v_value IS NULL OR v_value = '' THEN
            v_value := v_label;
        END IF;

        -- Check if this (category, value, company_id) already exists
        SELECT id INTO v_existing
        FROM master_options
        WHERE category = v_category AND value = v_value AND company_id = v_company
        LIMIT 1;

        IF v_existing IS NOT NULL THEN
            -- UPDATE existing row
            UPDATE master_options
            SET label      = v_label,
                sort_order = v_sort,
                is_active  = v_active
            WHERE id = v_existing;

            v_updated := v_updated + 1;
        ELSE
            -- INSERT new row with company_id
            INSERT INTO master_options (category, label, value, sort_order, is_active, company_id)
            VALUES (v_category, v_label, v_value, v_sort, v_active, v_company);

            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    -- Return summary
    RETURN jsonb_build_object(
        'success', TRUE,
        'inserted', v_inserted,
        'updated', v_updated,
        'skipped', v_skipped,
        'total_processed', v_inserted + v_updated + v_skipped
    );
END;
$$;

COMMENT ON FUNCTION public.upsert_master_options(jsonb) IS
    'Bulk upsert master_options (now company-aware). Accepts JSON array of {category, label, value, sort_order?, is_active?, company_id?}. Matches on (category + value + company_id). Falls back to caller''s company_id if not provided.';
