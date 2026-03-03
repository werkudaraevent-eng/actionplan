-- ============================================================================
-- Enable Supabase Realtime for action_plans table
-- ============================================================================
-- The frontend subscribes to postgres_changes on action_plans to auto-update
-- the UI when admins approve/reject unlock requests, grade plans, etc.
-- This requires the table to be added to the supabase_realtime publication.
-- ============================================================================

-- Supabase Realtime requires REPLICA IDENTITY FULL to include old values in
-- change payloads (needed to detect which fields changed).
ALTER TABLE public.action_plans REPLICA IDENTITY FULL;

-- Add to the realtime publication (idempotent — safe to re-run)
-- Using DO block to avoid errors if already added
DO $$
BEGIN
  -- Check if action_plans is already in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'action_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.action_plans;
    RAISE NOTICE 'Added action_plans to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'action_plans already in supabase_realtime publication';
  END IF;
END $$;
