-- 1. Tambahkan kolom yang kurang secara paksa
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS is_maintenance_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS announcement_text TEXT,
ADD COLUMN IF NOT EXISTS announcement_type TEXT DEFAULT 'info';

-- 2. Bangunkan API Supabase (Refresh Schema Cache)
NOTIFY pgrst, 'reload schema';