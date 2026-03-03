-- 1. Mengubah nama kolom teks mentah menjadi "museum" data lama
DO $$
BEGIN
    -- Cek apakah kolom 'pic' memang ada sebelum mencoba mengubah namanya
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'action_plans' 
          AND column_name = 'pic'
    ) THEN
        ALTER TABLE public.action_plans RENAME COLUMN pic TO legacy_pic_text;
    END IF;
END $$;

-- 2. Menambahkan kolom baru berwujud Array untuk menampung banyak UUID staf
-- Kita memberikan nilai default array kosong '{}' agar tidak terjadi error saat query
ALTER TABLE public.action_plans ADD COLUMN IF NOT EXISTS pic_ids uuid[] DEFAULT '{}'::uuid[];

-- 3. Menambahkan komentar arsitektur agar developer masa depan paham
COMMENT ON COLUMN public.action_plans.legacy_pic_text IS 'Data mentah dari import awal. Jangan gunakan untuk data baru.';
COMMENT ON COLUMN public.action_plans.pic_ids IS 'Array UUID yang terhubung ke tabel profiles. Digunakan untuk Multi-PIC system.';