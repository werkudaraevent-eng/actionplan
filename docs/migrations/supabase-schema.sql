-- =============================================
-- WERKUDARA GROUP - ACTION PLAN TRACKING SYSTEM
-- Supabase Database Schema & RLS Policies
-- =============================================

-- 1. PROFILES TABLE
-- Links to auth.users, stores role and department
-- =============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'dept_head')),
  department_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_profiles_department ON public.profiles(department_code);
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS Policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 2. ACTION PLANS TABLE
-- Main data table for tracking department action plans
-- =============================================
CREATE TABLE public.action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  department_code TEXT NOT NULL,
  
  -- Read-only columns (only admin can modify)
  month TEXT NOT NULL,
  goal_strategy TEXT NOT NULL,
  action_plan TEXT NOT NULL,
  indicator TEXT NOT NULL,
  pic TEXT NOT NULL,
  report_format TEXT NOT NULL DEFAULT 'Monthly Report',
  
  -- Editable columns (dept_head can modify)
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'On Progress', 'Achieved', 'Not Achieved')),
  outcome_link TEXT,
  remark TEXT
);

-- Create indexes for performance
CREATE INDEX idx_action_plans_department ON public.action_plans(department_code);
CREATE INDEX idx_action_plans_status ON public.action_plans(status);
CREATE INDEX idx_action_plans_month ON public.action_plans(month);

-- Enable RLS on action_plans
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;

-- 3. ROW LEVEL SECURITY POLICIES FOR ACTION_PLANS
-- =============================================

-- ADMIN POLICIES: Full access to all rows
CREATE POLICY "Admins can SELECT all action plans"
  ON public.action_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can INSERT action plans"
  ON public.action_plans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can UPDATE all action plans"
  ON public.action_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can DELETE action plans"
  ON public.action_plans FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- DEPT HEAD POLICIES: Limited access to own department
CREATE POLICY "Dept heads can SELECT own department plans"
  ON public.action_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() 
        AND role = 'dept_head' 
        AND department_code = action_plans.department_code
    )
  );

CREATE POLICY "Dept heads can UPDATE status, outcome, remark only"
  ON public.action_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() 
        AND role = 'dept_head' 
        AND department_code = action_plans.department_code
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() 
        AND role = 'dept_head' 
        AND department_code = action_plans.department_code
    )
  );

-- 4. FUNCTION TO HANDLE NEW USER REGISTRATION
-- Auto-creates profile when user signs up
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, department_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'dept_head'),
    NEW.raw_user_meta_data->>'department_code'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. FUNCTION TO UPDATE TIMESTAMP
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_action_plans_updated_at
  BEFORE UPDATE ON public.action_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 6. DEPARTMENTS REFERENCE TABLE (Optional but recommended)
-- =============================================
CREATE TABLE public.departments (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert all departments
INSERT INTO public.departments (code, name) VALUES
  ('BAS', 'Business & Administration Services'),
  ('PD', 'Product Development'),
  ('CFC', 'Corporate Finance Controller'),
  ('SS', 'Strategic Sourcing'),
  ('ACC', 'Accounting'),
  ('HR', 'Human Resources'),
  ('BID', 'Business & Innovation Development'),
  ('TEP', 'Tour and Event Planning'),
  ('GA', 'General Affairs'),
  ('ACS', 'Art & Creative Support'),
  ('SO', 'Sales Operation');

-- Enable RLS and allow all authenticated users to read departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view departments"
  ON public.departments FOR SELECT
  USING (auth.role() = 'authenticated');

-- 7. SEED DATA FOR TESTING (Optional)
-- Run this separately after creating test users
-- =============================================
/*
-- Example: Insert sample action plans for SO department
INSERT INTO public.action_plans (department_code, month, goal_strategy, action_plan, indicator, pic, report_format, status, outcome_link, remark)
VALUES
  ('SO', 'Jan', 'Increase Q1 Sales Revenue', 'Launch new product campaign', '20% revenue increase', 'John Doe', 'Monthly Report', 'Achieved', 'https://drive.google.com/report1', 'Campaign exceeded expectations'),
  ('SO', 'Feb', 'Expand Market Reach', 'Partner with 5 new distributors', '5 new partnerships', 'Jane Smith', 'Weekly Update', 'On Progress', '', '3 partnerships confirmed'),
  ('SO', 'Mar', 'Customer Retention', 'Implement loyalty program', '90% retention rate', 'Mike Johnson', 'Quarterly Review', 'Pending', '', ''),
  ('BAS', 'Jan', 'Streamline Operations', 'Implement new ERP system', 'System fully operational', 'Admin Team', 'Monthly Report', 'Achieved', 'https://drive.google.com/erp', 'Successfully deployed'),
  ('BAS', 'Feb', 'Cost Reduction', 'Audit vendor contracts', '15% cost reduction', 'Finance Lead', 'Quarterly Review', 'On Progress', '', 'Currently at 10% reduction'),
  ('HR', 'Jan', 'Talent Acquisition', 'Hire 10 new engineers', '10 hires completed', 'HR Manager', 'Monthly Report', 'Achieved', 'https://drive.google.com/hr1', 'All positions filled'),
  ('HR', 'Feb', 'Employee Training', 'Launch leadership program', '50 employees trained', 'Training Lead', 'Weekly Update', 'On Progress', '', '30 employees completed');
*/
