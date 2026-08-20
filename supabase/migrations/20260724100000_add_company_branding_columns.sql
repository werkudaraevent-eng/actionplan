-- Repair drift: the client selects companies.logo_url/description, but the
-- original logo migration only created storage policies and never added the
-- columns. Live databases already have them, so keep this idempotent.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS description text;
