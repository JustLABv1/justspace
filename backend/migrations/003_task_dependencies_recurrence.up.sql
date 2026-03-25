ALTER TABLE tasks
    ADD COLUMN dependencies TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN recurrence TEXT;

CREATE INDEX idx_tasks_dependencies ON tasks USING GIN (dependencies);