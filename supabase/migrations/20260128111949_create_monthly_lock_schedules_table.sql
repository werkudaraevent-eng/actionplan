-- Create monthly_lock_schedules table for specific deadline overrides
CREATE TABLE IF NOT EXISTS monthly_lock_schedules (
  id SERIAL PRIMARY KEY,
  month_index INTEGER NOT NULL CHECK (month_index >= 0 AND month_index <= 11),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  lock_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(month_index, year)
);

-- Enable RLS
ALTER TABLE monthly_lock_schedules ENABLE ROW LEVEL SECURITY;

-- Everyone can read schedules
CREATE POLICY "Anyone can read monthly lock schedules"
  ON monthly_lock_schedules FOR SELECT
  USING (true);

-- Only admins can insert/update/delete schedules
CREATE POLICY "Admins can manage monthly lock schedules"
  ON monthly_lock_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND LOWER(profiles.role) = 'admin'
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_monthly_lock_schedules_month_year 
  ON monthly_lock_schedules(month_index, year);;
