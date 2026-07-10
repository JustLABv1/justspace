DROP INDEX IF EXISTS idx_tasks_project_task_number;
DROP INDEX IF EXISTS idx_tasks_task_key;
DROP INDEX IF EXISTS idx_projects_task_key_prefix;

DROP TABLE IF EXISTS project_task_statuses;

ALTER TABLE tasks
    DROP COLUMN IF EXISTS task_key,
    DROP COLUMN IF EXISTS task_number;

ALTER TABLE projects
    DROP COLUMN IF EXISTS task_key_prefix,
    DROP COLUMN IF EXISTS next_task_number;

ALTER TABLE tasks
    ADD CONSTRAINT tasks_kanban_status_check
    CHECK (kanban_status IN ('todo', 'in-progress', 'review', 'waiting', 'done'));
