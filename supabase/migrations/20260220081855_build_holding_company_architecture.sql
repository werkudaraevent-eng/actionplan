-- [PERBAIKAN RANJAU] Tambahkan kolom updated_at ke departments agar trigger lama Anda tidak crash
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 1. Bangun Pilar Utama (Aman dari duplikasi)
CREATE TABLE IF NOT EXISTS public.companies (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 2. Siapkan Jalur Pipa Identitas (Aman dari duplikasi)
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.action_plans ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 3. Operasi Backfill (Naturalisasi Data Lama ke Werkudara)
DO $$
DECLARE
    werkudara_id uuid;
BEGIN
    -- Cek apakah entitas Werkudara sudah terlanjur dibuat di percobaan sebelumnya
    SELECT id INTO werkudara_id FROM public.companies WHERE name = 'Werkudara' LIMIT 1;

    -- Jika belum ada, baru buat
    IF werkudara_id IS NULL THEN
        INSERT INTO public.companies (name) 
        VALUES ('Werkudara') 
        RETURNING id INTO werkudara_id;
    END IF;

    -- Suntikkan ID Werkudara ke seluruh urat nadi data yang sudah ada
    UPDATE public.departments SET company_id = werkudara_id WHERE company_id IS NULL;
    UPDATE public.profiles SET company_id = werkudara_id WHERE company_id IS NULL;
    UPDATE public.action_plans SET company_id = werkudara_id WHERE company_id IS NULL;
    UPDATE public.system_settings SET company_id = werkudara_id WHERE company_id IS NULL;
END $$;

-- 4. Kunci Tembok Baja (Wajibkan Identitas Perusahaan Mulai Detik Ini)
ALTER TABLE public.departments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.action_plans ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.system_settings ALTER COLUMN company_id SET NOT NULL;