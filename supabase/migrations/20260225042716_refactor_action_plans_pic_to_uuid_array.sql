-- 1. Mengubah nama kolom teks mentah menjadi "museum" data lama
ALTER TABLE public.action_plans RENAME COLUMN pic TO legacy_pic_text;

-- 2. Menambahkan kolom baru berwujud Array untuk menampung banyak UUID staf
-- Kita memberikan nilai default array kosong '{}' agar tidak terjadi error saat query
ALTER TABLE public.action_plans ADD COLUMN pic_ids uuid[] DEFAULT '{}'::uuid[];

-- 3. Menambahkan komentar arsitektur agar developer masa depan paham
COMMENT ON COLUMN public.action_plans.legacy_pic_text IS 'Data mentah dari import awal. Jangan gunakan untuk data baru.';
COMMENT ON COLUMN public.action_plans.pic_ids IS 'Array UUID yang terhubung ke tabel profiles. Digunakan untuk Multi-PIC system.';