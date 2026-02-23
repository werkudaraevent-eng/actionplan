-- 1. Buat "Otak Penjaga" (Alat pemindai KTP Perusahaan berdasarkan Profil)
CREATE OR REPLACE FUNCTION public.get_auth_company_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 2. Pastikan Mode Keamanan (RLS) Menyala di Tabel Master
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 3. Pasang Tembok Isolasi di Action Plans
DROP POLICY IF EXISTS "Tenant Isolation for Action Plans" ON public.action_plans;
CREATE POLICY "Tenant Isolation for Action Plans" ON public.action_plans
    FOR ALL
    USING (company_id = public.get_auth_company_id())
    WITH CHECK (company_id = public.get_auth_company_id());

-- 4. Pasang Tembok Isolasi di Departments
DROP POLICY IF EXISTS "Tenant Isolation for Departments" ON public.departments;
CREATE POLICY "Tenant Isolation for Departments" ON public.departments
    FOR ALL
    USING (company_id = public.get_auth_company_id())
    WITH CHECK (company_id = public.get_auth_company_id());

-- 5. Pasang Tembok Isolasi di System Settings
DROP POLICY IF EXISTS "Tenant Isolation for System Settings" ON public.system_settings;
CREATE POLICY "Tenant Isolation for System Settings" ON public.system_settings
    FOR ALL
    USING (company_id = public.get_auth_company_id())
    WITH CHECK (company_id = public.get_auth_company_id());