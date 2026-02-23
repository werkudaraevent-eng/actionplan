-- 1. Hancurkan borgol aturan role masa lalu
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Buat "Mata Dewa" ke-2 (Alat Pemindai Role)
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 3. Hancurkan Tembok Isolasi Lama
DROP POLICY IF EXISTS "Tenant Isolation for Action Plans" ON public.action_plans;
DROP POLICY IF EXISTS "Tenant Isolation for Departments" ON public.departments;
DROP POLICY IF EXISTS "Tenant Isolation for System Settings" ON public.system_settings;

-- 4. Bangun Tembok Cerdas (Isolasi ketat, KECUALI untuk holding_admin)
CREATE POLICY "Tenant Isolation for Action Plans" ON public.action_plans
    FOR ALL
    USING (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin')
    WITH CHECK (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin');

CREATE POLICY "Tenant Isolation for Departments" ON public.departments
    FOR ALL
    USING (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin')
    WITH CHECK (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin');

CREATE POLICY "Tenant Isolation for System Settings" ON public.system_settings
    FOR ALL
    USING (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin')
    WITH CHECK (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin');

-- 5. Promosi Jabatan Mutlak (Sekarang tidak akan ada yang memblokir)
UPDATE public.profiles
SET role = 'holding_admin'
WHERE email = 'hanung@werkudara.com';