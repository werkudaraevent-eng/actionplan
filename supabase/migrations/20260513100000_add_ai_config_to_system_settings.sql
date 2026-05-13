ALTER TABLE public.system_settings
ADD COLUMN IF NOT EXISTS ai_config jsonb NOT NULL DEFAULT '{
  "enabled": true,
  "proxy_url": null,
  "model_fast": null,
  "model_reasoning": null,
  "timeout_ms": 60000,
  "vision": true
}'::jsonb;
