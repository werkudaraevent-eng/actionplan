CREATE OR REPLACE FUNCTION public.get_carry_over_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'carry_over_penalty_1', COALESCE(carry_over_penalty_1, 80),
    'carry_over_penalty_2', COALESCE(carry_over_penalty_2, 50)
  ) INTO v_result
  FROM system_settings
  WHERE id = 1;

  IF v_result IS NULL THEN
    v_result := jsonb_build_object('carry_over_penalty_1', 80, 'carry_over_penalty_2', 50);
  END IF;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (RLS on system_settings handles read access)
GRANT EXECUTE ON FUNCTION public.get_carry_over_settings() TO authenticated;;
