ALTER TABLE action_plans ADD COLUMN blocker_category TEXT CHECK (blocker_category IN ('Internal', 'External', 'Budget', 'Approval'));;
