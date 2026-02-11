-- Step 1: Add grading config columns to system_settings (singleton, id=1)
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS is_strict_grading_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS standard_passing_score integer NOT NULL DEFAULT 80;

ALTER TABLE system_settings
  ADD CONSTRAINT standard_passing_score_range
  CHECK (standard_passing_score BETWEEN 1 AND 100);

-- Step 2: Create the grade_action_plan RPC
CREATE OR REPLACE FUNCTION grade_action_plan(
  p_plan_id uuid,
  p_input_score integer,
  p_status text,
  p_admin_feedback text,
  p_reviewed_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan record;
  v_strict boolean;
  v_passing integer;
  v_final_status text;
  v_final_score integer;
  v_max_score integer;
  v_category text;
BEGIN
  -- 1. Fetch grading settings
  SELECT is_strict_grading_enabled, standard_passing_score
    INTO v_strict, v_passing
    FROM system_settings
    WHERE id = 1;

  IF v_strict IS NULL THEN
    v_strict := false;
    v_passing := 80;
  END IF;

  -- 2. Fetch the plan (with race-condition guard)
  SELECT * INTO v_plan
    FROM action_plans
    WHERE id = p_plan_id
      AND submission_status = 'submitted'
      AND deleted_at IS NULL;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan not found or not in submitted status. It may have been recalled.';
  END IF;

  v_max_score := COALESCE(v_plan.max_possible_score, 100);
  v_category := UPPER(COALESCE(v_plan.category, ''));

  -- Clamp input score to max possible
  v_final_score := LEAST(p_input_score, v_max_score);

  -- 3. Apply grading logic
  IF v_strict THEN
    -- STRICT MODE: system determines status based on score + category
    IF v_category LIKE 'UH%' OR v_category LIKE 'ULTRA%' OR v_category LIKE 'H%' OR v_category = 'HIGH' THEN
      -- Ultra High / High: must match max_possible_score exactly
      IF v_final_score >= v_max_score THEN
        v_final_status := 'Achieved';
      ELSE
        v_final_status := 'Not Achieved';
      END IF;
    ELSE
      -- Medium / Low: must meet standard_passing_score threshold
      IF v_final_score >= v_passing THEN
        v_final_status := 'Achieved';
      ELSE
        v_final_status := 'Not Achieved';
      END IF;
    END IF;
  ELSE
    -- FLEXIBLE MODE: respect the admin's decision from frontend
    v_final_status := p_status;
  END IF;

  -- 4. Update the plan
  UPDATE action_plans SET
    status = v_final_status,
    quality_score = v_final_score,
    admin_feedback = p_admin_feedback,
    reviewed_by = p_reviewed_by,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_plan_id
    AND submission_status = 'submitted';

  -- 5. Return result
  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'final_status', v_final_status,
    'final_score', v_final_score,
    'max_score', v_max_score,
    'strict_mode', v_strict,
    'passing_threshold', v_passing,
    'category', v_plan.category
  );
END;
$$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';;
