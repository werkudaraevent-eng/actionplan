-- Add type column to progress_logs to distinguish between casual comments and official progress updates
ALTER TABLE progress_logs 
ADD COLUMN type VARCHAR(50) DEFAULT 'comment';

-- Add comment explaining the column
COMMENT ON COLUMN progress_logs.type IS 'Type of log entry: comment (casual from ViewDetailModal), progress_update (official from ActionPlanModal status update)';

-- Update existing entries that look like official updates (contain [BLOCKER RESOLVED] prefix)
UPDATE progress_logs 
SET type = 'progress_update' 
WHERE message LIKE '[BLOCKER RESOLVED]%';;
