-- ============================================================================
-- RPC: upsert_master_options
-- Purpose: Bulk upsert master_options rows. Accepts a JSON array of objects.
--          For each item: if (category + value) exists → update label/sort_order/is_active.
--          Otherwise → insert new row.
-- Usage:   SELECT upsert_master_options('[{"category":"ROOT_CAUSE","label":"Manpower","value":"Manpower"}]'::jsonb);
-- ============================================================================

-- Admin-only guard is enforced via RLS on master_options table.
-- This RPC runs as SECURITY INVOKER so the caller's RLS policies apply.

CREATE OR REPLACE FUNCTION public.upsert_master_options(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
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
    v_existing  UUID;
BEGIN
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

        -- Skip rows missing required fields
        IF v_category IS NULL OR v_category = '' OR v_label IS NULL OR v_label = '' THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Auto-generate value from label if not provided
        IF v_value IS NULL OR v_value = '' THEN
            v_value := v_label;
        END IF;

        -- Check if this (category, value) already exists
        SELECT id INTO v_existing
        FROM master_options
        WHERE category = v_category AND value = v_value
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
            -- INSERT new row
            INSERT INTO master_options (category, label, value, sort_order, is_active)
            VALUES (v_category, v_label, v_value, v_sort, v_active);

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

-- Grant execute to authenticated users (RLS on master_options enforces admin-only writes)
GRANT EXECUTE ON FUNCTION public.upsert_master_options(JSONB) TO authenticated;

COMMENT ON FUNCTION public.upsert_master_options IS
    'Bulk upsert master_options. Accepts JSON array of {category, label, value, sort_order?, is_active?}. '
    'Matches on (category + value): updates if exists, inserts if new. Skips rows with missing category/label.';
