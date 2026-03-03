-- 1. Hancurkan semua policy lama jika sudah ada (Mencegah error 'already exists')
DROP POLICY IF EXISTS "Allow authenticated to update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated to insert company logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public to read company logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated to delete company logos" ON storage.objects;

-- 2. Baru buat ulang policy-nya (Biarkan kode CREATE POLICY Anda yang lama tetap di bawah sini)
-- CREATE POLICY "Allow authenticated to update company logos" ... dst

CREATE POLICY "Allow authenticated to upload company logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'company_logos');
CREATE POLICY "Allow authenticated to update company logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'company_logos');