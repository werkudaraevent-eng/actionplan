-- Insert gap category options into dropdown_options table
INSERT INTO public.dropdown_options (category, label, is_active, sort_order)
VALUES
  ('gap_category', 'Budget Issue', true, 1),
  ('gap_category', 'Manpower Shortage', true, 2),
  ('gap_category', 'Timeline Constraint', true, 3),
  ('gap_category', 'External Factor', true, 4),
  ('gap_category', 'Resource Unavailability', true, 5),
  ('gap_category', 'Technical Limitation', true, 6),
  ('gap_category', 'Scope Change', true, 7),
  ('gap_category', 'Dependency Delay', true, 8),
  ('gap_category', 'Process Issue', true, 9),
  ('gap_category', 'Other', true, 99)
ON CONFLICT DO NOTHING;;
