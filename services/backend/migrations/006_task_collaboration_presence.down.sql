DROP TRIGGER IF EXISTS update_task_comments_updated_at ON task_comments;

DROP TABLE IF EXISTS task_presence;
DROP TABLE IF EXISTS project_presence;
DROP TABLE IF EXISTS task_comments;
DROP TABLE IF EXISTS task_assignees;

DROP INDEX IF EXISTS idx_activity_task_id;

ALTER TABLE activity
DROP COLUMN IF EXISTS task_id;
