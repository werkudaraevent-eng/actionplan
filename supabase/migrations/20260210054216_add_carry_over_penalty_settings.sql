ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS carry_over_penalty_1 integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS carry_over_penalty_2 integer NOT NULL DEFAULT 50;

COMMENT ON COLUMN public.system_settings.carry_over_penalty_1 IS 'Max possible score (%) for a plan carried over once (Late Month 1). Default 80.';
COMMENT ON COLUMN public.system_settings.carry_over_penalty_2 IS 'Max possible score (%) for a plan carried over twice (Late Month 2). Default 50.';

ALTER TABLE public.system_settings
  ADD CONSTRAINT carry_over_penalty_1_range CHECK (carry_over_penalty_1 >= 0 AND carry_over_penalty_1 <= 100),
  ADD CONSTRAINT carry_over_penalty_2_range CHECK (carry_over_penalty_2 >= 0 AND carry_over_penalty_2 <= 100);

INSERT INTO public.system_settings (id, carry_over_penalty_1, carry_over_penalty_2)
VALUES (1, 80, 50)
ON CONFLICT (id) DO UPDATE SET
  carry_over_penalty_1 = COALESCE(system_settings.carry_over_penalty_1, 80),
  carry_over_penalty_2 = COALESCE(system_settings.carry_over_penalty_2, 50);;
