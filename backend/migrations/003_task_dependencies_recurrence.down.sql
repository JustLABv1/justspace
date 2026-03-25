DROP INDEX IF EXISTS idx_tasks_dependencies;

ALTER TABLE tasks
    DROP COLUMN IF EXISTS recurrence,
    DROP COLUMN IF EXISTS dependencies;