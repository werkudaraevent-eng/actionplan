-- 1. Hancurkan aturan usang yang melarang duplikasi global (jika masih ada)
ALTER TABLE public.dropdown_options DROP CONSTRAINT IF EXISTS dropdown_options_category_label_key;

-- 2. Hancurkan aturan baru jika kebetulan sudah terpasang secara manual di Production
ALTER TABLE public.dropdown_options DROP CONSTRAINT IF EXISTS dropdown_options_company_category_label_key;

-- 3. Pasang ulang aturan Multi-Tenant: Duplikasi DILARANG hanya jika berada di dalam anak perusahaan (company_id) yang SAMA
ALTER TABLE public.dropdown_options ADD CONSTRAINT dropdown_options_company_category_label_key UNIQUE (company_id, category, label);

-- 4. Tampar cache API untuk memastikan Frontend sadar
NOTIFY pgrst, 'reload schema';