-- Shared workspace foundation for projects, documentation, and snippets.
CREATE TABLE IF NOT EXISTS workspaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(120) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, slug)
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'guest')),
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_user_id ON workspaces(owner_user_id);

-- Every existing account gets one deterministic personal workspace. Existing
-- resources are assigned before the columns become mandatory.
INSERT INTO workspaces (owner_user_id, name, slug)
SELECT u.id,
       COALESCE(NULLIF(TRIM(u.name), ''), 'Personal workspace'),
       'personal-' || REPLACE(LEFT(u.id::text, 8), '-', '')
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_user_id = u.id);

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_user_id, 'owner'
FROM workspaces w
WHERE NOT EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = w.id AND wm.user_id = w.owner_user_id
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE wiki_guides ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE projects p
SET workspace_id = w.id
FROM workspaces w
WHERE p.workspace_id IS NULL AND w.owner_user_id = p.user_id;

UPDATE wiki_guides g
SET workspace_id = w.id
FROM workspaces w
WHERE g.workspace_id IS NULL AND w.owner_user_id = g.user_id;

UPDATE snippets s
SET workspace_id = w.id
FROM workspaces w
WHERE s.workspace_id IS NULL AND w.owner_user_id = s.user_id;

ALTER TABLE projects ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE wiki_guides ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE snippets ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wiki_guides_workspace_id ON wiki_guides(workspace_id);
CREATE INDEX IF NOT EXISTS idx_snippets_workspace_id ON snippets(workspace_id);

DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces;
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
