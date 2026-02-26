-- 1. Buat fungsi untuk memburu dan menghapus plan duplikat jika Carry Over dibatalkan
CREATE OR REPLACE FUNCTION handle_carry_over_reversal()
RETURNS TRIGGER AS $$
BEGIN
    -- Jika plan sebelumnya di-carry over, dan sekarang dibatalkan (di-uncheck)
    IF OLD.is_carry_over = TRUE AND NEW.is_carry_over = FALSE THEN
        -- Hapus plan di bulan depan yang memiliki origin_plan_id sama dengan plan ini
        DELETE FROM public.action_plans
        WHERE origin_plan_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Pasang Trigger di tabel action_plans
DROP TRIGGER IF EXISTS trigger_revert_carry_over ON public.action_plans;
CREATE TRIGGER trigger_revert_carry_over
AFTER UPDATE ON public.action_plans
FOR EACH ROW
WHEN (OLD.is_carry_over = TRUE AND NEW.is_carry_over = FALSE)
EXECUTE FUNCTION handle_carry_over_reversal();