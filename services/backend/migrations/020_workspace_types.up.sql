ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS type VARCHAR(32) NOT NULL DEFAULT 'project_management'
    CHECK (type IN ('project_management', 'consulting'));
