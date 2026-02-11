-- Role Permissions Table for dynamic access control
-- Allows admins to configure what each role can do

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique combination of role + resource + action
  CONSTRAINT role_permissions_unique UNIQUE (role, resource, action),
  
  -- Validate role values
  CONSTRAINT role_permissions_role_check CHECK (role IN ('admin', 'executive', 'leader', 'staff'))
);

-- Create index for fast lookups by role
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);

-- Create index for fast lookups by resource
CREATE INDEX IF NOT EXISTS idx_role_permissions_resource ON role_permissions(resource);

-- Enable RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Everyone can read, only admins can write
CREATE POLICY "role_permissions_select_all" ON role_permissions
  FOR SELECT USING (true);

CREATE POLICY "role_permissions_admin_insert" ON role_permissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "role_permissions_admin_update" ON role_permissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "role_permissions_admin_delete" ON role_permissions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Seed default permissions
-- Admin gets all permissions
INSERT INTO role_permissions (role, resource, action, is_allowed) VALUES
  -- Admin permissions (all true)
  ('admin', 'action_plan', 'create', true),
  ('admin', 'action_plan', 'edit', true),
  ('admin', 'action_plan', 'delete', true),
  ('admin', 'action_plan', 'update_status', true),
  ('admin', 'action_plan', 'update_progress', true),
  ('admin', 'action_plan', 'grade', true),
  ('admin', 'action_plan', 'submit', true),
  ('admin', 'user', 'create', true),
  ('admin', 'user', 'edit', true),
  ('admin', 'user', 'delete', true),
  ('admin', 'user', 'view', true),
  ('admin', 'report', 'view', true),
  ('admin', 'report', 'export', true),
  ('admin', 'settings', 'manage', true),
  
  -- Executive permissions (read-only)
  ('executive', 'action_plan', 'create', false),
  ('executive', 'action_plan', 'edit', false),
  ('executive', 'action_plan', 'delete', false),
  ('executive', 'action_plan', 'update_status', false),
  ('executive', 'action_plan', 'update_progress', false),
  ('executive', 'action_plan', 'grade', false),
  ('executive', 'action_plan', 'submit', false),
  ('executive', 'user', 'create', false),
  ('executive', 'user', 'edit', false),
  ('executive', 'user', 'delete', false),
  ('executive', 'user', 'view', true),
  ('executive', 'report', 'view', true),
  ('executive', 'report', 'export', true),
  ('executive', 'settings', 'manage', false),
  
  -- Leader permissions
  ('leader', 'action_plan', 'create', true),
  ('leader', 'action_plan', 'edit', true),
  ('leader', 'action_plan', 'delete', true),
  ('leader', 'action_plan', 'update_status', true),
  ('leader', 'action_plan', 'update_progress', true),
  ('leader', 'action_plan', 'grade', false),
  ('leader', 'action_plan', 'submit', true),
  ('leader', 'user', 'create', false),
  ('leader', 'user', 'edit', false),
  ('leader', 'user', 'delete', false),
  ('leader', 'user', 'view', true),
  ('leader', 'report', 'view', true),
  ('leader', 'report', 'export', true),
  ('leader', 'settings', 'manage', false),
  
  -- Staff permissions (most restricted)
  ('staff', 'action_plan', 'create', false),
  ('staff', 'action_plan', 'edit', false),
  ('staff', 'action_plan', 'delete', false),
  ('staff', 'action_plan', 'update_status', true),
  ('staff', 'action_plan', 'update_progress', true),
  ('staff', 'action_plan', 'grade', false),
  ('staff', 'action_plan', 'submit', false),
  ('staff', 'user', 'create', false),
  ('staff', 'user', 'edit', false),
  ('staff', 'user', 'delete', false),
  ('staff', 'user', 'view', false),
  ('staff', 'report', 'view', false),
  ('staff', 'report', 'export', false),
  ('staff', 'settings', 'manage', false)
ON CONFLICT (role, resource, action) DO NOTHING;;
