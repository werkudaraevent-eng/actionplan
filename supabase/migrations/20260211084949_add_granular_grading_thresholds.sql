-- Step 1: Add 4 granular threshold columns to system_settings
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS threshold_uh integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS threshold_h  integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS threshold_m  integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS threshold_l  integer NOT NULL DEFAULT 70;

-- Step 2: Add CHECK constraints
ALTER TABLE public.system_settings
  ADD CONSTRAINT chk_threshold_uh CHECK (threshold_uh BETWEEN 1 AND 100),
  ADD CONSTRAINT chk_threshold_h  CHECK (threshold_h  BETWEEN 1 AND 100),
  ADD CONSTRAINT chk_threshold_m  CHECK (threshold_m  BETWEEN 1 AND 100),
  ADD CONSTRAINT chk_threshold_l  CHECK (threshold_l  BETWEEN 1 AND 100);

-- Step 3: Seed defaults into existing row (id=1)
UPDATE public.system_settings
SET threshold_uh = 100,
    threshold_h  = 100,
    threshold_m  = COALESCE(standard_passing_score, 80),
    threshold_l  = 70
WHERE id = 1;

-- Step 4: Replace grade_action_plan RPC with granular threshold logic
CREATE OR REPLACE FUNCTION public.grade_action_plan(
  p_plan_id      uuid,
  p_input_score  integer,
  p_status       text DEFAULT 'Achieved',
  p_admin_feedback text DEFAULT NULL,
  p_reviewed_by  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_strict           boolean;
  v_threshold_uh     integer;
  v_threshold_h      integer;
  v_threshold_m      integer;
  v_threshold_l      integer;
  v_category         text;
  v_max_score        integer;
  v_submission_status text;
  v_selected_threshold integer;
  v_passing_target   integer;
  v_final_status     text;
  v_final_score      integer;
BEGIN
  -- 1. Fetch settings
  SELECT is_strict_grading_enabled, threshold_uh, threshold_h, threshold_m, threshold_l
  INTO v_strict, v_threshold_uh, v_threshold_h, v_threshold_m, v_threshold_l
  FROM public.system_settings
  WHERE id = 1;

  -- 2. Fetch plan data with race-condition guard
  SELECT category, max_possible_score, submission_status
  INTO v_category, v_max_score, v_submission_status
  FROM public.action_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  IF v_submission_status <> 'submitted' THEN
    RAISE EXCEPTION 'Plan is not in submitted status (may have been recalled)';
  END IF;

  -- Default max score
  IF v_max_score IS NULL OR v_max_score <= 0 THEN
    v_max_score := 100;
  END IF;

  -- Clamp input score
  v_final_score := LEAST(p_input_score, v_max_score);

  -- 3. Determine status
  IF v_strict THEN
    -- Select threshold based on category
    DECLARE
      v_cat_upper text := UPPER(COALESCE(v_category, ''));
    BEGIN
      IF v_cat_upper LIKE 'UH%' OR v_cat_upper LIKE 'ULTRA%' THEN
        v_selected_threshold := v_threshold_uh;
      ELSIF v_cat_upper LIKE 'H%' OR v_cat_upper = 'HIGH' THEN
        v_selected_threshold := v_threshold_h;
      ELSIF v_cat_upper LIKE 'M%' OR v_cat_upper = 'MEDIUM' THEN
        v_selected_threshold := v_threshold_m;
      ELSIF v_cat_upper LIKE 'L%' OR v_cat_upper = 'LOW' THEN
        v_selected_threshold := v_threshold_l;
      ELSE
        -- Unknown category: fall back to medium threshold
        v_selected_threshold := v_threshold_m;
      END IF;
    END;

    -- Fairness: cap threshold at plan's max possible score
    v_passing_target := LEAST(v_selected_threshold, v_max_score);

    IF v_final_score >= v_passing_target THEN
      v_final_status := 'Achieved';
    ELSE
      v_final_status := 'Not Achieved';
    END IF;
  ELSE
    -- Flexible mode: respect admin's decision
    v_final_status := p_status;
  END IF;

  -- 4. Update the plan
  UPDATE public.action_plans
  SET quality_score    = v_final_score,
      status           = v_final_status,
      admin_feedback   = p_admin_feedback,
      reviewed_by      = p_reviewed_by,
      reviewed_at      = now(),
      updated_at       = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'final_status', v_final_status,
    'final_score', v_final_score,
    'passing_target', v_passing_target,
    'strict_mode', v_strict,
    'selected_threshold', v_selected_threshold
  );
END;
$$;

-- Step 5: Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';;
