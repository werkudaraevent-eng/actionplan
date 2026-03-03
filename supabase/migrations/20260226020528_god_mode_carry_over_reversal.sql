-- 1. Perbarui Fungsi Menjadi Lebih Cerdas dan Agresif
CREATE OR REPLACE FUNCTION handle_carry_over_reversal()
RETURNS TRIGGER AS $$
BEGIN
    -- Jika sebelumnya Carry Over itu AKTIF, 
    -- dan SEKARANG statusnya diubah jadi BUKAN 'Not Achieved' 
    -- ATAU secara eksplisit centangnya dimatikan oleh React
    IF (OLD.is_carry_over = TRUE) AND 
       (NEW.is_carry_over = FALSE OR (OLD.status = 'Not Achieved' AND NEW.status != 'Not Achieved')) THEN
        
        -- 1. Bunuh plan duplikat di bulan depan tanpa ampun
        DELETE FROM public.action_plans
        WHERE origin_plan_id = NEW.id;
        
        -- 2. Koreksi paksa data dari React: Matikan status carry over-nya!
        NEW.is_carry_over := FALSE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Hapus Trigger Lama
DROP TRIGGER IF EXISTS trigger_revert_carry_over ON public.action_plans;

-- 3. Pasang Trigger Baru (Gunakan BEFORE UPDATE agar bisa mengoreksi data NEW)
CREATE TRIGGER trigger_revert_carry_over
BEFORE UPDATE ON public.action_plans
FOR EACH ROW
EXECUTE FUNCTION handle_carry_over_reversal();