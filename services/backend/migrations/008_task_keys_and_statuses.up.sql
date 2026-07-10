ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS task_key_prefix VARCHAR(16),
    ADD COLUMN IF NOT EXISTS next_task_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS task_number INTEGER,
    ADD COLUMN IF NOT EXISTS task_key VARCHAR(32);

ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_kanban_status_check;

CREATE TABLE IF NOT EXISTS project_task_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key VARCHAR(64) NOT NULL,
    label VARCHAR(64) NOT NULL,
    color_token VARCHAR(16) NOT NULL DEFAULT 'default',
    position INTEGER NOT NULL DEFAULT 0,
    is_completed_state BOOLEAN NOT NULL DEFAULT FALSE,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT project_task_statuses_project_key_unique UNIQUE (project_id, key),
    CONSTRAINT project_task_statuses_project_position_unique UNIQUE (project_id, position)
);

DO $$
DECLARE
    project_record RECORD;
    base_prefix TEXT;
    candidate_prefix TEXT;
    suffix_counter INTEGER;
BEGIN
    FOR project_record IN
        SELECT id, name
        FROM projects
        ORDER BY created_at, id
    LOOP
        base_prefix := UPPER(REGEXP_REPLACE(COALESCE(project_record.name, ''), '[^A-Za-z0-9]+', '', 'g'));
        IF base_prefix = '' THEN
            base_prefix := 'PRJ';
        END IF;
        base_prefix := SUBSTRING(base_prefix FROM 1 FOR 8);
        candidate_prefix := base_prefix;
        suffix_counter := 1;

        WHILE EXISTS (
            SELECT 1
            FROM projects p
            WHERE p.task_key_prefix = candidate_prefix
              AND p.id <> project_record.id
        ) LOOP
            suffix_counter := suffix_counter + 1;
            candidate_prefix := SUBSTRING(base_prefix FROM 1 FOR GREATEST(1, 8 - LENGTH(suffix_counter::TEXT))) || suffix_counter::TEXT;
        END LOOP;

        UPDATE projects
        SET task_key_prefix = candidate_prefix
        WHERE id = project_record.id
          AND task_key_prefix IS NULL;
    END LOOP;
END $$;

WITH numbered_tasks AS (
    SELECT
        t.id,
        t.project_id,
        ROW_NUMBER() OVER (PARTITION BY t.project_id ORDER BY t.created_at, t.id) AS next_number
    FROM tasks t
)
UPDATE tasks t
SET
    task_number = numbered_tasks.next_number,
    task_key = p.task_key_prefix || '-' || numbered_tasks.next_number
FROM numbered_tasks
JOIN projects p ON p.id = numbered_tasks.project_id
WHERE t.id = numbered_tasks.id
  AND (t.task_number IS NULL OR t.task_key IS NULL);

UPDATE projects p
SET next_task_number = COALESCE(project_counts.max_task_number, 0) + 1
FROM (
    SELECT project_id, MAX(task_number) AS max_task_number
    FROM tasks
    GROUP BY project_id
) AS project_counts
WHERE p.id = project_counts.project_id;

INSERT INTO project_task_statuses (project_id, key, label, color_token, position, is_completed_state, is_builtin)
SELECT p.id, status_seed.key, status_seed.label, status_seed.color_token, status_seed.position, status_seed.is_completed_state, TRUE
FROM projects p
CROSS JOIN (
    VALUES
        ('todo', 'Todo', 'default', 0, FALSE),
        ('in-progress', 'In progress', 'accent', 1, FALSE),
        ('review', 'Review', 'warning', 2, FALSE),
        ('waiting', 'Blocked', 'danger', 3, FALSE),
        ('done', 'Done', 'success', 4, TRUE)
) AS status_seed(key, label, color_token, position, is_completed_state)
ON CONFLICT (project_id, key) DO NOTHING;

ALTER TABLE projects
    ALTER COLUMN task_key_prefix SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_task_key_prefix ON projects(task_key_prefix);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_key ON tasks(task_key);
CREATE INDEX IF NOT EXISTS idx_tasks_project_task_number ON tasks(project_id, task_number);
