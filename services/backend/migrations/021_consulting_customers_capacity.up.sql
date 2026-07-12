CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    notes TEXT NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_customers_workspace_id ON customers(workspace_id);
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hour_budget REAL CHECK (hour_budget IS NULL OR hour_budget >= 0);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);

ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS weekly_capacity_days REAL NOT NULL DEFAULT 5 CHECK (weekly_capacity_days >= 0);

CREATE TABLE IF NOT EXISTS project_member_allocations (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    days_per_week REAL NOT NULL CHECK (days_per_week >= 0),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_member_allocations_user_id ON project_member_allocations(user_id);
