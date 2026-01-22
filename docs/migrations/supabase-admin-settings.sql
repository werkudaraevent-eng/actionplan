-- =============================================
-- Admin Settings Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Departments Table (Master Data)
CREATE TABLE IF NOT EXISTS departments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Everyone can read departments
CREATE POLICY "Anyone can read departments"
  ON departments FOR SELECT
  USING (true);

-- Only admins can modify departments
CREATE POLICY "Admins can insert departments"
  ON departments FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update departments"
  ON departments FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete departments"
  ON departments FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed initial departments (skip if exists)
INSERT INTO departments (code, name) VALUES
  ('BAS', 'Business & Administration Services'),
  ('HR', 'Human Resources'),
  ('FIN', 'Finance'),
  ('IT', 'Information Technology'),
  ('MKT', 'Marketing'),
  ('OPS', 'Operations'),
  ('SALES', 'Sales'),
  ('RND', 'Research & Development'),
  ('LEGAL', 'Legal'),
  ('CS', 'Customer Service'),
  ('PROC', 'Procurement')
ON CONFLICT (code) DO NOTHING;

-- 2. Annual Targets Table
CREATE TABLE IF NOT EXISTS annual_targets (
  year int PRIMARY KEY,
  target_percentage int NOT NULL DEFAULT 80,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE annual_targets ENABLE ROW LEVEL SECURITY;

-- Everyone can read targets
CREATE POLICY "Anyone can read annual_targets"
  ON annual_targets FOR SELECT
  USING (true);

-- Only admins can modify targets
CREATE POLICY "Admins can insert annual_targets"
  ON annual_targets FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update annual_targets"
  ON annual_targets FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete annual_targets"
  ON annual_targets FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed default targets
INSERT INTO annual_targets (year, target_percentage) VALUES
  (2023, 75),
  (2024, 80),
  (2025, 85),
  (2026, 90)
ON CONFLICT (year) DO NOTHING;

-- 3. Historical Stats Table (Monthly Granularity)
DROP TABLE IF EXISTS historical_stats;
CREATE TABLE historical_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  department_code text NOT NULL,
  year int NOT NULL,
  month int NOT NULL CHECK (month >= 1 AND month <= 12),
  completion_rate decimal(5,2) NOT NULL CHECK (completion_rate >= 0 AND completion_rate <= 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(department_code, year, month)
);

-- Enable RLS
ALTER TABLE historical_stats ENABLE ROW LEVEL SECURITY;

-- Everyone can read historical stats
CREATE POLICY "Anyone can read historical_stats"
  ON historical_stats FOR SELECT
  USING (true);

-- Only admins can modify historical stats
CREATE POLICY "Admins can insert historical_stats"
  ON historical_stats FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update historical_stats"
  ON historical_stats FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete historical_stats"
  ON historical_stats FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_historical_stats_year ON historical_stats(year);
CREATE INDEX IF NOT EXISTS idx_historical_stats_dept ON historical_stats(department_code);
CREATE INDEX IF NOT EXISTS idx_historical_stats_lookup ON historical_stats(department_code, year);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
DROP TRIGGER IF EXISTS departments_updated_at ON departments;
CREATE TRIGGER departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS annual_targets_updated_at ON annual_targets;
CREATE TRIGGER annual_targets_updated_at
  BEFORE UPDATE ON annual_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS historical_stats_updated_at ON historical_stats;
CREATE TRIGGER historical_stats_updated_at
  BEFORE UPDATE ON historical_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
