-- ============================================================================
-- Storage RLS Policies for 'avatars' bucket
-- ============================================================================
-- Error: "new row violates row-level security policy"
-- The public 'avatars' bucket has RLS enabled but no policies allowing
-- authenticated users to upload, update, or delete their own avatars.
--
-- Policy scoping:
--   SELECT  -> Public (anyone can view avatars via public URL)
--   INSERT  -> Authenticated users can upload to their own folder ({userId}/*)
--   UPDATE  -> Authenticated users can update files in their own folder
--   DELETE  -> Authenticated users can delete files in their own folder
--
-- File path convention: {userId}/{timestamp}_avatar.{ext}
-- The (storage.foldername(name))[1] function extracts the first folder segment.
-- ============================================================================

-- 1. Public read access (avatars are displayed publicly in the UI)
CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- 2. Authenticated users can upload avatars to their own folder
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Authenticated users can update their own avatars
CREATE POLICY "Users can update their own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Authenticated users can delete their own avatars
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
