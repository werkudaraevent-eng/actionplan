-- ============================================
-- NOTIFICATION SYSTEM ARCHITECTURE
-- ============================================

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who receives this notification?
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Who triggered this notification? (e.g., BOD member, Leader)
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- The resource this notification is about
  resource_id UUID NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('ACTION_PLAN', 'COMMENT', 'BLOCKER', 'PROGRESS_LOG')),
  
  -- Notification type
  type TEXT NOT NULL CHECK (type IN (
    'NEW_COMMENT',
    'MENTION',
    'STATUS_CHANGE',
    'KICKBACK',
    'BLOCKER_REPORTED',
    'BLOCKER_RESOLVED',
    'GRADE_RECEIVED',
    'UNLOCK_APPROVED',
    'UNLOCK_REJECTED',
    'TASK_ASSIGNED'
  )),
  
  -- Notification content (optional - for custom messages)
  title TEXT,
  message TEXT,
  
  -- Read status
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_resource ON notifications(resource_id, resource_type);

-- 3. Enable RLS - Users can only see their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can UPDATE (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: System can INSERT notifications (via triggers/functions)
-- Using SECURITY DEFINER functions for inserts
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (TRUE);

-- Policy: Users can DELETE their own notifications (dismiss)
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Add documentation
COMMENT ON TABLE notifications IS 'Notification center for user alerts - comments, status changes, kickbacks, etc.';
COMMENT ON COLUMN notifications.user_id IS 'The user who receives this notification';
COMMENT ON COLUMN notifications.actor_id IS 'The user who triggered this notification (e.g., commenter, grader)';
COMMENT ON COLUMN notifications.resource_id IS 'ID of the related resource (action_plan, comment, etc.)';
COMMENT ON COLUMN notifications.resource_type IS 'Type of resource: ACTION_PLAN, COMMENT, BLOCKER, PROGRESS_LOG';
COMMENT ON COLUMN notifications.type IS 'Notification type: NEW_COMMENT, MENTION, STATUS_CHANGE, KICKBACK, etc.';;
