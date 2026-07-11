DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces;
ALTER TABLE snippets DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE wiki_guides DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE projects DROP COLUMN IF EXISTS workspace_id;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS workspaces;
