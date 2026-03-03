-- File: supabase/migrations/[timestamp]_add_holding_parent_entity.sql

-- 1. Memperbaiki struktur tabel agar mendukung integritas data multi-tenant
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_name_key') THEN
        ALTER TABLE public.companies ADD CONSTRAINT companies_name_key UNIQUE (name);
    END IF;
END $$;

-- 2. Menciptakan Entitas Induk Resmi
INSERT INTO public.companies (name) 
VALUES ('Werkudara Group') 
ON CONFLICT (name) DO NOTHING;

-- 3. Migrasi Akun Eksekutif ke Markas Besar
UPDATE public.profiles
SET company_id = (SELECT id FROM public.companies WHERE name = 'Werkudara Group')
WHERE email IN ('hanung@werkudara.com', 'nofri@takshaka.id');