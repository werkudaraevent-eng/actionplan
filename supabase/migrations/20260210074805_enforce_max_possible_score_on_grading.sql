-- Backend protection: clamp quality_score to max_possible_score on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.clamp_quality_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when quality_score is being set and max_possible_score exists
  IF NEW.quality_score IS NOT NULL AND NEW.max_possible_score IS NOT NULL AND NEW.max_possible_score < 100 THEN
    IF NEW.quality_score > NEW.max_possible_score THEN
      NEW.quality_score := NEW.max_possible_score;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_clamp_quality_score ON public.action_plans;

-- Create trigger on INSERT and UPDATE
CREATE TRIGGER trg_clamp_quality_score
  BEFORE INSERT OR UPDATE OF quality_score ON public.action_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.clamp_quality_score();;
