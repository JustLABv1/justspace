ALTER TABLE notifications ADD COLUMN deadline_at TIMESTAMPTZ;

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('mention', 'task_assigned', 'deadline_24h', 'deadline_4h', 'deadline_due'));

CREATE UNIQUE INDEX idx_notifications_deadline_delivery
    ON notifications(recipient_user_id, task_id, type, deadline_at)
    WHERE deadline_at IS NOT NULL;
