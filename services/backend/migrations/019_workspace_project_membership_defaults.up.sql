ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS auto_add_members_to_projects BOOLEAN NOT NULL DEFAULT FALSE;
