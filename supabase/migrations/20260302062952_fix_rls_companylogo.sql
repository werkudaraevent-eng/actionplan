-- 1. Hancurkan semua policy lama yang mungkin saling bentrok
DROP POLICY IF EXISTS "Allow authenticated to upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated to update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated to read company logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated to delete company logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public to read company logos" ON storage.objects;

-- 2. Izin Membaca (Mutlak diperlukan agar aplikasi bisa merender logo dan melakukan pengecekan upsert)
CREATE POLICY "Allow public to read company logos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'company_logos');

-- 3. Izin Memasukkan (Upload Baru) - Khusus staf yang login
CREATE POLICY "Allow authenticated to insert company logos" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'company_logos');

-- 4. Izin Memperbarui (Ganti Logo) - Khusus staf yang login
CREATE POLICY "Allow authenticated to update company logos" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id = 'company_logos');

-- 5. Izin Menghapus (Hapus Logo) - Khusus staf yang login
CREATE POLICY "Allow authenticated to delete company logos" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'company_logos');