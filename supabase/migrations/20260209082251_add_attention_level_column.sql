ALTER TABLE action_plans ADD COLUMN attention_level TEXT DEFAULT 'Standard' CHECK (attention_level IN ('Standard', 'Leader', 'Management_BOD')) NOT NULL;;
