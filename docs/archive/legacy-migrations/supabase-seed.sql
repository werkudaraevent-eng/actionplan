-- =============================================
-- SEED DATA FOR TESTING
-- Run this AFTER creating test users in Supabase Auth
-- =============================================

-- Sample Action Plans for SO (Sales Operation)
INSERT INTO public.action_plans (department_code, month, goal_strategy, action_plan, indicator, pic, report_format, status, outcome_link, remark)
VALUES
  ('SO', 'Jan', 'Increase Q1 Sales Revenue', 'Launch new product campaign targeting enterprise clients', '20% revenue increase', 'John Doe', 'Monthly Report', 'Achieved', 'https://drive.google.com/report1', 'Campaign exceeded expectations with 25% increase'),
  ('SO', 'Feb', 'Expand Market Reach', 'Partner with 5 new distributors in Southeast Asia', '5 new partnerships signed', 'Jane Smith', 'Weekly Update', 'On Progress', '', '3 partnerships confirmed, 2 in negotiation'),
  ('SO', 'Mar', 'Customer Retention Program', 'Implement loyalty program with tiered rewards', '90% retention rate', 'Mike Johnson', 'Quarterly Review', 'Pending', '', ''),
  ('SO', 'Apr', 'Digital Sales Channel', 'Launch e-commerce platform with 100+ products', 'Platform live with 100 products', 'Sarah Lee', 'Monthly Report', 'Not Achieved', 'https://drive.google.com/report2', 'Technical issues delayed launch by 2 weeks');

-- Sample Action Plans for BAS (Business & Administration Services)
INSERT INTO public.action_plans (department_code, month, goal_strategy, action_plan, indicator, pic, report_format, status, outcome_link, remark)
VALUES
  ('BAS', 'Jan', 'Streamline Operations', 'Implement new ERP system across all departments', 'System fully operational', 'Admin Team', 'Monthly Report', 'Achieved', 'https://drive.google.com/erp-report', 'ERP successfully deployed across all departments'),
  ('BAS', 'Feb', 'Cost Reduction Initiative', 'Audit and optimize vendor contracts', '15% cost reduction', 'Finance Lead', 'Quarterly Review', 'On Progress', '', 'Currently at 10% reduction, ongoing negotiations'),
  ('BAS', 'Mar', 'Process Documentation', 'Create SOP for all core business processes', '100% SOP coverage', 'QA Team', 'Weekly Update', 'Pending', '', '');

-- Sample Action Plans for HR (Human Resources)
INSERT INTO public.action_plans (department_code, month, goal_strategy, action_plan, indicator, pic, report_format, status, outcome_link, remark)
VALUES
  ('HR', 'Jan', 'Talent Acquisition', 'Hire 10 new software engineers for product team', '10 hires completed', 'HR Manager', 'Monthly Report', 'Achieved', 'https://drive.google.com/hr1', 'All positions filled ahead of schedule'),
  ('HR', 'Feb', 'Employee Training', 'Launch leadership development program', '50 employees trained', 'Training Lead', 'Weekly Update', 'On Progress', '', '30 employees completed training'),
  ('HR', 'Mar', 'Performance Review System', 'Implement 360-degree feedback system', 'System deployed company-wide', 'HR Director', 'Quarterly Review', 'Pending', '', '');

-- Sample Action Plans for CFC (Corporate Finance Controller)
INSERT INTO public.action_plans (department_code, month, goal_strategy, action_plan, indicator, pic, report_format, status, outcome_link, remark)
VALUES
  ('CFC', 'Jan', 'Financial Reporting Automation', 'Automate monthly financial reports', '80% automation achieved', 'Finance Manager', 'Monthly Report', 'Achieved', 'https://drive.google.com/finance1', 'Reduced report generation time by 70%'),
  ('CFC', 'Feb', 'Budget Optimization', 'Review and optimize departmental budgets', '10% budget efficiency', 'Budget Analyst', 'Quarterly Review', 'On Progress', '', 'Analysis phase completed'),
  ('CFC', 'Mar', 'Compliance Audit', 'Complete annual compliance audit', 'Zero compliance issues', 'Compliance Officer', 'Annual Report', 'Pending', '', '');

-- Sample Action Plans for PD (Product Development)
INSERT INTO public.action_plans (department_code, month, goal_strategy, action_plan, indicator, pic, report_format, status, outcome_link, remark)
VALUES
  ('PD', 'Jan', 'New Product Launch', 'Launch mobile app v2.0 with new features', 'App released on stores', 'Product Lead', 'Monthly Report', 'Achieved', 'https://drive.google.com/pd1', 'Successfully launched with 4.5 star rating'),
  ('PD', 'Feb', 'User Experience Improvement', 'Redesign checkout flow based on user feedback', '30% conversion increase', 'UX Designer', 'Weekly Update', 'On Progress', '', 'A/B testing in progress'),
  ('PD', 'Mar', 'API Integration', 'Integrate with 3 major payment gateways', '3 integrations completed', 'Tech Lead', 'Monthly Report', 'Not Achieved', '', 'Delayed due to third-party API issues');
