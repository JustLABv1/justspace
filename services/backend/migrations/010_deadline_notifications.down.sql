DROP INDEX IF EXISTS idx_notifications_deadline_delivery;

DELETE FROM notifications WHERE deadline_at IS NOT NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('mention', 'task_assigned'));

ALTER TABLE notifications DROP COLUMN IF EXISTS deadline_at;
