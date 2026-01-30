-- Create progress_logs table for tracking "On Progress" status updates
CREATE TABLE progress_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_plan_id UUID NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups by action_plan_id
CREATE INDEX idx_progress_logs_action_plan_id ON progress_logs(action_plan_id);

-- Create index for ordering by created_at
CREATE INDEX idx_progress_logs_created_at ON progress_logs(created_at DESC);

-- Enable RLS
ALTER TABLE progress_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admin can do everything
CREATE POLICY "Admin full access to progress_logs"
  ON progress_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Users can view progress logs for action plans they have access to
CREATE POLICY "Users can view progress logs for accessible action plans"
  ON progress_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM action_plans ap
      JOIN profiles p ON p.id = auth.uid()
      WHERE ap.id = progress_logs.action_plan_id
      AND (
        p.role = 'admin'
        OR p.role = 'executive'
        OR ap.department_code = p.department_code
        OR ap.department_code = ANY(p.additional_departments)
      )
    )
  );

-- Leaders and Staff can insert progress logs for their department's action plans
CREATE POLICY "Users can insert progress logs for their department"
  ON progress_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM action_plans ap
      JOIN profiles p ON p.id = auth.uid()
      WHERE ap.id = progress_logs.action_plan_id
      AND (
        p.role = 'admin'
        OR ap.department_code = p.department_code
        OR ap.department_code = ANY(p.additional_departments)
      )
    )
  );

-- Add comment for documentation
COMMENT ON TABLE progress_logs IS 'Stores progress update messages when action plans are set to On Progress status';;
