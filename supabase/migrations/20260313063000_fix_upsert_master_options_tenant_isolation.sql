-- ============================================================================
-- FIX: upsert_master_options – Enforce Strict Tenant Isolation
-- ============================================================================
-- ROOT CAUSE: When a holding_admin switches to subsidiary "Gooper" in the UI,
--   the frontend's activeCompanyId = Gooper's UUID. However, the RPC's
--   fallback get_auth_company_id() returns the admin's PROFILE company
--   (e.g., Werkudara), NOT the UI-selected subsidiary.
--
-- This caused cross-tenant writes: options intended for Gooper were
-- matched and updated against Werkudara's existing data.
--
-- FIX STRATEGY:
--   1. For holding_admin: REQUIRE explicit company_id in every item.
--      Refuse to fall back to get_auth_company_id() since it's unreliable
--      for cross-tenant admins.
--   2. For regular admin: ENFORCE that every item's company_id matches
--      get_auth_company_id(). Reject any mismatch (defense-in-depth).
--   3. Both the SELECT lookup and INSERT now use the validated company_id.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_master_options(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_item        JSONB;
    v_inserted    INT := 0;
    v_updated     INT := 0;
    v_skipped     INT := 0;
    v_category    TEXT;
    v_label       TEXT;
    v_value       TEXT;
    v_sort        INT;
    v_active      BOOLEAN;
    v_company     UUID;
    v_existing    UUID;
    v_auth_company UUID;
    v_is_holding   BOOLEAN;
BEGIN
    -- Get the caller's identity
    v_auth_company := public.get_auth_company_id();
    v_is_holding   := (public.get_auth_role() = 'holding_admin');

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

        -- ── COMPANY_ID RESOLUTION WITH STRICT TENANT ENFORCEMENT ────────
        v_company  := (v_item ->> 'company_id')::UUID;

        IF v_is_holding THEN
            -- Holding admin MUST provide explicit company_id per item.
            -- We NEVER fall back to get_auth_company_id() because it
            -- returns the admin's own profile company, NOT the target subsidiary.
            IF v_company IS NULL THEN
                RAISE WARNING 'Holding admin: item [%/%] has no company_id, skipping.', v_category, v_label;
                v_skipped := v_skipped + 1;
                CONTINUE;
            END IF;
        ELSE
            -- Regular admin: default to their own company if not provided
            v_company := COALESCE(v_company, v_auth_company);

            -- DEFENSE-IN-DEPTH: reject if the item's company_id ≠ caller's company
            IF v_company IS DISTINCT FROM v_auth_company THEN
                RAISE WARNING 'Tenant mismatch: item company_id (%) ≠ auth company_id (%). Skipping.', v_company, v_auth_company;
                v_skipped := v_skipped + 1;
                CONTINUE;
            END IF;
        END IF;

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
        WHERE category = v_category
          AND value = v_value
          AND company_id = v_company
        LIMIT 1;

        IF v_existing IS NOT NULL THEN
            -- UPDATE existing row (scoped to the correct company)
            UPDATE master_options
            SET label      = v_label,
                sort_order = v_sort,
                is_active  = v_active
            WHERE id = v_existing
              AND company_id = v_company;  -- Belt-and-suspenders: re-verify company_id

            v_updated := v_updated + 1;
        ELSE
            -- INSERT new row with the validated company_id
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
    'Bulk upsert master_options with STRICT tenant isolation. '
    'holding_admin: MUST pass explicit company_id per item (no fallback). '
    'Regular admin: company_id defaults to caller profile, rejects mismatches. '
    'Matches on (category + value + company_id).';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
