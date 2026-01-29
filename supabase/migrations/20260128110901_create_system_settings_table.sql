-- Create system_settings table for global configurations
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_lock_enabled BOOLEAN DEFAULT TRUE,
  lock_cutoff_day INTEGER DEFAULT 6 CHECK (lock_cutoff_day >= 1 AND lock_cutoff_day <= 28),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Ensure only one row exists
CREATE UNIQUE INDEX IF NOT EXISTS system_settings_single_row ON system_settings ((id = 1));

-- Insert default row
INSERT INTO system_settings (id, is_lock_enabled, lock_cutoff_day)
VALUES (1, true, 6)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Anyone can read system settings"
  ON system_settings FOR SELECT
  USING (true);

-- Only admins can update settings
CREATE POLICY "Admins can update system settings"
  ON system_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND LOWER(profiles.role) = 'admin'
    )
  );

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_system_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_timestamp();;
