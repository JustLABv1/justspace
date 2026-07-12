ALTER TABLE user_keys
    ADD COLUMN IF NOT EXISTS kdf_iterations INTEGER NOT NULL DEFAULT 100000
    CHECK (kdf_iterations >= 100000);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_members_single_owner
    ON project_members (project_id)
    WHERE role = 'owner';
