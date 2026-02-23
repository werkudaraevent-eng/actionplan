-- 1. Perbaikan Permanen Satpam Pintu Depan (Trigger handle_new_user)
-- Mengatasi constraint NOT NULL dari arsitektur lama (role & email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_company_id uuid;
BEGIN
    -- Ekstrak KTP dari koper Edge Function
    BEGIN
        v_company_id := CAST(NULLIF(new.raw_user_meta_data->>'company_id', '') AS uuid);
    EXCEPTION WHEN OTHERS THEN
        v_company_id := NULL;
    END;

    -- KTP Darurat (Ambil perusahaan pertama yang ada, biasanya Werkudara)
    IF v_company_id IS NULL THEN
        SELECT id INTO v_company_id FROM public.companies LIMIT 1;
    END IF;

    -- Eksekusi Mutlak: Penuhi kelima syarat NOT NULL dari masa lalu
    INSERT INTO public.profiles (
        id, 
        email, 
        full_name, 
        role, 
        company_id
    )
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', 'Unknown User'),
        'staff', -- Jaring Pengaman Utama untuk kolom role
        v_company_id
    );
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Operasi Data: Melahirkan Takshaka & Memindahkan Viana
DO $$
DECLARE
    v_takshaka_id uuid;
BEGIN
    -- Cek apakah Takshaka sudah ada di sistem
    SELECT id INTO v_takshaka_id FROM public.companies WHERE name = 'Takshaka' LIMIT 1;

    -- Jika belum ada, lahirkan Takshaka sekarang
    IF v_takshaka_id IS NULL THEN
        INSERT INTO public.companies (name) VALUES ('Takshaka') RETURNING id INTO v_takshaka_id;
    END IF;

    -- Koreksi KTP Larasati Viana agar resmi menjadi warga Takshaka
    UPDATE public.profiles 
    SET company_id = v_takshaka_id 
    WHERE email = 'viana@takshaka.id';
END $$;