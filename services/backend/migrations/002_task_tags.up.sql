ALTER TABLE tasks
    ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_tasks_tags ON tasks USING GIN (tags);