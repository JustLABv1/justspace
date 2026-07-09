ALTER TABLE project_files
ADD COLUMN task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX idx_project_files_task_id ON project_files(task_id);
