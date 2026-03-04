-- 1. Hancurkan gembok monopoli lama (Baik itu berupa Constraint maupun Index)
ALTER TABLE public.master_options DROP CONSTRAINT IF EXISTS idx_master_options_unique_value;
DROP INDEX IF EXISTS public.idx_master_options_unique_value;

-- 2. Hancurkan gembok baru jika kebetulan sudah terpasang (Idempotent)
ALTER TABLE public.master_options DROP CONSTRAINT IF EXISTS master_options_company_category_value_key;

-- 3. Pasang aturan Multi-Tenant: Duplikasi DILARANG HANYA JIKA di dalam perusahaan yang SAMA
ALTER TABLE public.master_options ADD CONSTRAINT master_options_company_category_value_key UNIQUE (company_id, category, value);

-- 4. Tampar cache API agar Frontend langsung sadar
NOTIFY pgrst, 'reload schema';