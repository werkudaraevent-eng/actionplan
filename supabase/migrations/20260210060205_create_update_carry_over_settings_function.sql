CREATE OR REPLACE FUNCTION public.update_carry_over_settings(
  p_penalty_1 integer,
  p_penalty_2 integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Authorization: admin only
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'Administrator') THEN
    RAISE EXCEPTION 'Unauthorized: only administrators can update carry-over settings';
  END IF;

  -- Validation
  IF p_penalty_1 < 0 OR p_penalty_1 > 100 THEN
    RAISE EXCEPTION 'penalty_1 must be between 0 and 100';
  END IF;
  IF p_penalty_2 < 0 OR p_penalty_2 > 100 THEN
    RAISE EXCEPTION 'penalty_2 must be between 0 and 100';
  END IF;
  IF p_penalty_2 >= p_penalty_1 THEN
    RAISE EXCEPTION 'penalty_2 must be less than penalty_1 (second carry-over should be stricter)';
  END IF;

  -- Upsert
  INSERT INTO system_settings (id, carry_over_penalty_1, carry_over_penalty_2, updated_at, updated_by)
  VALUES (1, p_penalty_1, p_penalty_2, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET
    carry_over_penalty_1 = p_penalty_1,
    carry_over_penalty_2 = p_penalty_2,
    updated_at = now(),
    updated_by = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'carry_over_penalty_1', p_penalty_1,
    'carry_over_penalty_2', p_penalty_2
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_carry_over_settings(integer, integer) TO authenticated;;
