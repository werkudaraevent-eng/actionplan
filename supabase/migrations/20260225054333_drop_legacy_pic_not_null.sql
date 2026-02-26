-- Menghapus batasan wajib isi pada kolom lama karena sistem sekarang menggunakan pic_ids (UUID)
ALTER TABLE public.action_plans ALTER COLUMN legacy_pic_text DROP NOT NULL;