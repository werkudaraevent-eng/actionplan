ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS email_config JSONB DEFAULT '{}'::jsonb;;
