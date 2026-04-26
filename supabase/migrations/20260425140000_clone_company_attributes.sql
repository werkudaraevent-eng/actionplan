-- ============================================================================
-- MIGRATION: Clone Company Attributes RPC
-- Date: 2026-04-25
-- Purpose: RPC to clone departments, system_settings, dropdown_options,
--          and master_options from one company to another.
--          Used by HoldingManagement "Copy from existing subsidiary" feature.
-- ============================================================================

CREATE OR REPLACE FUNCTION clone_company_attributes(
  p_source_company_id UUID,
  p_target_company_id UUID,
  p_dept_prefix TEXT DEFAULT NULL,
  p_include_plans BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept_map JSONB := '{}';
  v_source_dept RECORD;
  v_new_code TEXT;
  v_dept_count INT := 0;
  v_settings_count INT := 0;
  v_options_count INT := 0;
  v_plans_count INT := 0;
BEGIN
  -- Validate companies exist
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_source_company_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source company not found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_target_company_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target company not found');
  END IF;

  -- 1. Clone departments (with prefix to avoid PK conflicts on code TEXT PRIMARY KEY)
  --    NOTE: departments table has no is_active column; clone all departments.
  FOR v_source_dept IN
    SELECT * FROM departments WHERE company_id = p_source_company_id
  LOOP
    v_new_code := COALESCE(p_dept_prefix || '-', '') || v_source_dept.code;

    -- Skip if code already exists (PK conflict)
    IF NOT EXISTS (SELECT 1 FROM departments WHERE code = v_new_code) THEN
      INSERT INTO departments (code, name, company_id)
      VALUES (v_new_code, v_source_dept.name, p_target_company_id);

      v_dept_map := v_dept_map || jsonb_build_object(v_source_dept.code, v_new_code);
      v_dept_count := v_dept_count + 1;
    END IF;
  END LOOP;

  -- 2. Clone system_settings
  --    Columns verified from schema:
  --      is_lock_enabled, lock_cutoff_day,
  --      is_strict_grading_enabled, standard_passing_score,
  --      threshold_uh, threshold_h, threshold_m, threshold_l,
  --      carry_over_penalty_1, carry_over_penalty_2, carry_over_penalties,
  --      scoring_policies, email_config,
  --      drop_approval_req_uh, drop_approval_req_h, drop_approval_req_m, drop_approval_req_l,
  --      is_maintenance_mode, announcement_text, announcement_type
  --    We intentionally do NOT copy maintenance mode or announcements.
  INSERT INTO system_settings (
    company_id,
    is_lock_enabled, lock_cutoff_day,
    is_strict_grading_enabled, standard_passing_score,
    threshold_uh, threshold_h, threshold_m, threshold_l,
    carry_over_penalty_1, carry_over_penalty_2, carry_over_penalties,
    scoring_policies, email_config,
    drop_approval_req_uh, drop_approval_req_h, drop_approval_req_m, drop_approval_req_l,
    is_maintenance_mode, announcement_text, announcement_type
  )
  SELECT
    p_target_company_id,
    is_lock_enabled, lock_cutoff_day,
    is_strict_grading_enabled, standard_passing_score,
    threshold_uh, threshold_h, threshold_m, threshold_l,
    carry_over_penalty_1, carry_over_penalty_2, carry_over_penalties,
    scoring_policies, email_config,
    drop_approval_req_uh, drop_approval_req_h, drop_approval_req_m, drop_approval_req_l,
    FALSE, NULL, NULL  -- Don't copy maintenance mode or announcements
  FROM system_settings
  WHERE company_id = p_source_company_id
  ON CONFLICT (company_id) DO NOTHING;

  GET DIAGNOSTICS v_settings_count = ROW_COUNT;

  -- 3. Clone dropdown_options
  --    Unique constraint: (company_id, category, label)
  INSERT INTO dropdown_options (company_id, category, label, sort_order, is_active)
  SELECT p_target_company_id, category, label, sort_order, is_active
  FROM dropdown_options
  WHERE company_id = p_source_company_id
  ON CONFLICT (company_id, category, label) DO NOTHING;

  GET DIAGNOSTICS v_options_count = ROW_COUNT;

  -- 4. Clone master_options
  --    Unique constraint: (company_id, category, value)
  INSERT INTO master_options (company_id, category, value, label, sort_order, is_active)
  SELECT p_target_company_id, category, value, label, sort_order, is_active
  FROM master_options
  WHERE company_id = p_source_company_id
  ON CONFLICT (company_id, category, value) DO NOTHING;

  v_options_count := v_options_count + (
    SELECT COUNT(*) FROM master_options WHERE company_id = p_target_company_id
  );

  -- 5. Clone sample action plans (if requested and departments were mapped)
  IF p_include_plans AND jsonb_typeof(v_dept_map) = 'object' AND v_dept_map != '{}' THEN
    INSERT INTO action_plans (
      department_code, company_id, month, year,
      goal_strategy, action_plan, indicator,
      category, area_focus, evidence,
      status, report_format
    )
    SELECT
      v_dept_map->>ap.department_code,  -- Map to new department code
      p_target_company_id,
      ap.month, ap.year,
      ap.goal_strategy, ap.action_plan, ap.indicator,
      ap.category, ap.area_focus, ap.evidence,
      'Open', ap.report_format
    FROM action_plans ap
    WHERE ap.company_id = p_source_company_id
      AND ap.deleted_at IS NULL
      AND ap.is_carry_over = FALSE
      AND v_dept_map ? ap.department_code  -- Only for mapped departments
    LIMIT 100;  -- Safety limit for sample data

    GET DIAGNOSTICS v_plans_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'departments_cloned', v_dept_count,
    'settings_cloned', v_settings_count,
    'options_cloned', v_options_count,
    'plans_cloned', v_plans_count,
    'department_map', v_dept_map
  );
END;
$$;
