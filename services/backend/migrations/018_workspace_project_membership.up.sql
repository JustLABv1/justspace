-- A project invitation also creates a workspace membership on acceptance.
ALTER TABLE team_invitations
    ADD COLUMN IF NOT EXISTS workspace_role VARCHAR(16) NOT NULL DEFAULT 'member'
        CHECK (workspace_role IN ('admin', 'member', 'guest'));

-- Preserve existing project collaboration when enforcing workspace-backed
-- project membership. Project roles remain project-local.
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT p.workspace_id,
       pm.user_id,
       'member'
FROM project_members pm
JOIN projects p ON p.id = pm.project_id
ON CONFLICT (workspace_id, user_id) DO NOTHING;
