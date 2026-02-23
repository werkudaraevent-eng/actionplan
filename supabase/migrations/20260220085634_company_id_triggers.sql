CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_company_id uuid;
BEGIN
    -- 1. Ekstrak KTP dari koper Edge Function
    BEGIN
        v_company_id := CAST(NULLIF(new.raw_user_meta_data->>'company_id', '') AS uuid);
    EXCEPTION WHEN OTHERS THEN
        v_company_id := NULL;
    END;

    -- 2. KTP Darurat (Werkudara)
    IF v_company_id IS NULL THEN
        SELECT id INTO v_company_id FROM public.companies LIMIT 1;
    END IF;

    -- 3. Eksekusi Mutlak: Penuhi kelima syarat NOT NULL dari developer lama Anda
    INSERT INTO public.profiles (
        id, 
        email, 
        full_name, 
        role, 
        company_id
    )
    VALUES (
        new.id,
        new.email, -- Diambil langsung dari data pendaftaran
        COALESCE(new.raw_user_meta_data->>'full_name', 'Unknown User'), -- Jaring pengaman nama
        'staff', -- JARING PENGAMAN UTAMA: Pemuas kolom "role" yang wajib isi
        v_company_id
    );
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;