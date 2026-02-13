-- ============================================================
-- MIGRATION: Multi-File Evidence & Attachments System
-- Created: 2026-02-13
-- Purpose:
--   1. Add `attachments` JSONB column to `action_plans`
--   2. Create `evidence-attachments` storage bucket
--   3. Storage RLS policies (public read, authenticated write)
--   4. Helper RPC: update_plan_evidence(plan_id, evidence_text, attachments_json)
-- ============================================================


-- ──────────────────────────────────────────────────
-- 1. Schema: Add attachments column
-- ──────────────────────────────────────────────────
-- Data structure:
-- [
--   { "type": "file", "name": "report.pdf", "url": "...", "size": "2MB", "mime": "application/pdf" },
--   { "type": "link", "url": "https://...", "title": "Google Drive" }
-- ]

ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.action_plans.attachments IS
  'Array of evidence attachments. Each element: { type: file|link, name?, url, size?, mime?, title? }';


-- ──────────────────────────────────────────────────
-- 2. Storage Bucket: evidence-attachments
-- ──────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence-attachments',
  'evidence-attachments',
  true,                            -- Public URLs enabled
  10485760,                        -- 10 MB per file
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ──────────────────────────────────────────────────
-- 3. Storage Policies
-- ──────────────────────────────────────────────────

-- 3a. Anyone can VIEW/DOWNLOAD evidence files (public bucket)
DROP POLICY IF EXISTS "evidence_public_read" ON storage.objects;
CREATE POLICY "evidence_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'evidence-attachments');

-- 3b. Authenticated users can UPLOAD evidence files
DROP POLICY IF EXISTS "evidence_auth_upload" ON storage.objects;
CREATE POLICY "evidence_auth_upload"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'evidence-attachments'
    AND auth.role() = 'authenticated'
  );

-- 3c. Authenticated users can UPDATE their uploads (e.g., overwrite)
DROP POLICY IF EXISTS "evidence_auth_update" ON storage.objects;
CREATE POLICY "evidence_auth_update"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'evidence-attachments'
    AND auth.role() = 'authenticated'
  );

-- 3d. Authenticated users can DELETE evidence files
DROP POLICY IF EXISTS "evidence_auth_delete" ON storage.objects;
CREATE POLICY "evidence_auth_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'evidence-attachments'
    AND auth.role() = 'authenticated'
  );


-- ──────────────────────────────────────────────────
-- 4. RPC: update_plan_evidence
-- ──────────────────────────────────────────────────
-- Atomically update both legacy `evidence` text and the new `attachments` JSONB array.
-- If a parameter is NULL, the corresponding column is left unchanged.

CREATE OR REPLACE FUNCTION public.update_plan_evidence(
  p_plan_id       UUID,
  p_evidence      TEXT     DEFAULT NULL,
  p_attachments   JSONB    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
BEGIN
  -- Validate plan exists
  SELECT id INTO v_plan
  FROM action_plans
  WHERE id = p_plan_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action plan not found: %', p_plan_id;
  END IF;

  -- Update evidence fields
  UPDATE action_plans
  SET
    evidence    = COALESCE(p_evidence, evidence),
    attachments = COALESCE(p_attachments, attachments),
    updated_at  = NOW()
  WHERE id = p_plan_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.update_plan_evidence(UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.update_plan_evidence IS
  'Atomically update evidence text and/or attachments JSON array for an action plan.';
