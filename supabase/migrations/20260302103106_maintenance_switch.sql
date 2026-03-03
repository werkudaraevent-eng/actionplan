-- 1. Pastikan fitur keamanan RLS (Row Level Security) benar-benar menyala untuk tabel ini
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 2. (Opsional) Hapus policy lama jika Anda pernah mencoba membuatnya dan gagal
DROP POLICY IF EXISTS "Allow authenticated to update system settings" ON system_settings;

-- 3. Berikan hak mutlak untuk MEMPERBARUI status ke user yang sudah login
CREATE POLICY "Allow authenticated to update system settings" 
ON system_settings 
FOR UPDATE 
TO authenticated 
USING (true);