-- =====================================================
-- Dropdown Options Table for Dynamic Select Inputs
-- =====================================================

-- Create the dropdown_options table
CREATE TABLE IF NOT EXISTS dropdown_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category VARCHAR(50) NOT NULL,  -- 'failure_reason', 'delete_reason'
  label VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique labels per category
  UNIQUE(category, label)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_dropdown_options_category ON dropdown_options(category);
CREATE INDEX IF NOT EXISTS idx_dropdown_options_active ON dropdown_options(is_active);

-- Enable RLS
ALTER TABLE dropdown_options ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Everyone can read active options, only admins can modify
CREATE POLICY "Anyone can read active dropdown options"
  ON dropdown_options FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can read all dropdown options"
  ON dropdown_options FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert dropdown options"
  ON dropdown_options FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update dropdown options"
  ON dropdown_options FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- Seed Data: Initial Dropdown Options
-- =====================================================

-- Failure Reasons (used when status = 'Not Achieved')
INSERT INTO dropdown_options (category, label, sort_order) VALUES
  ('failure_reason', 'Vendor / Third Party Issue', 1),
  ('failure_reason', 'Budget Constraints', 2),
  ('failure_reason', 'Manpower Shortage', 3),
  ('failure_reason', 'Timeline / Scheduling Conflict', 4),
  ('failure_reason', 'Technical Issues', 5),
  ('failure_reason', 'Scope Change', 6),
  ('failure_reason', 'Management Decision', 7),
  ('failure_reason', 'External Factors', 8),
  ('failure_reason', 'Other', 99)
ON CONFLICT (category, label) DO NOTHING;

-- Delete Reasons (used when deleting/cancelling a plan)
INSERT INTO dropdown_options (category, label, sort_order) VALUES
  ('delete_reason', 'Duplicate Entry', 1),
  ('delete_reason', 'No Longer Relevant', 2),
  ('delete_reason', 'Merged with Another Plan', 3),
  ('delete_reason', 'Created in Error', 4),
  ('delete_reason', 'Superseded by New Plan', 5),
  ('delete_reason', 'Department Restructure', 6),
  ('delete_reason', 'Budget Reallocation', 7),
  ('delete_reason', 'Other', 99)
ON CONFLICT (category, label) DO NOTHING;

-- =====================================================
-- Helper function to update timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_dropdown_options_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dropdown_options_updated_at
  BEFORE UPDATE ON dropdown_options
  FOR EACH ROW
  EXECUTE FUNCTION update_dropdown_options_updated_at();
