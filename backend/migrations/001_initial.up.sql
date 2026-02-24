-- justspace: Initial database schema
-- Migrated from Appwrite collections to PostgreSQL

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) UNIQUE NOT NULL,
    name       VARCHAR(255) NOT NULL DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Projects
-- ============================================================
CREATE TABLE projects (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           VARCHAR(512) NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    status         VARCHAR(20) NOT NULL DEFAULT 'todo'
                       CHECK (status IN ('todo', 'in-progress', 'completed')),
    days_per_week  REAL,
    allocated_days INTEGER,
    is_encrypted   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_projects_user_id ON projects(user_id);

-- ============================================================
-- Tasks
-- ============================================================
CREATE TABLE tasks (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title            VARCHAR(256) NOT NULL,
    completed        BOOLEAN NOT NULL DEFAULT FALSE,
    parent_id        UUID REFERENCES tasks(id) ON DELETE SET NULL,
    time_spent       INTEGER NOT NULL DEFAULT 0,
    is_timer_running BOOLEAN NOT NULL DEFAULT FALSE,
    timer_started_at TIMESTAMPTZ,
    time_entries     JSONB NOT NULL DEFAULT '[]',
    sort_order       INTEGER NOT NULL DEFAULT 0,
    priority         VARCHAR(10) NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    kanban_status    VARCHAR(20) NOT NULL DEFAULT 'todo'
                         CHECK (kanban_status IN ('todo', 'in-progress', 'review', 'waiting', 'done')),
    deadline         TIMESTAMPTZ,
    notes            JSONB NOT NULL DEFAULT '[]',
    is_encrypted     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);

-- ============================================================
-- Wiki Guides
-- ============================================================
CREATE TABLE wiki_guides (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(512) NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wiki_guides_user_id ON wiki_guides(user_id);

-- ============================================================
-- Installations
-- ============================================================
CREATE TABLE installations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guide_id      UUID NOT NULL REFERENCES wiki_guides(id) ON DELETE CASCADE,
    target        VARCHAR(512) NOT NULL,
    git_repo      VARCHAR(512),
    documentation VARCHAR(512),
    notes         TEXT,
    tasks         JSONB NOT NULL DEFAULT '[]',
    is_encrypted  BOOLEAN NOT NULL DEFAULT FALSE,
    iv            VARCHAR(32),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_installations_guide_id ON installations(guide_id);
CREATE INDEX idx_installations_user_id ON installations(user_id);

-- ============================================================
-- Activity Log
-- ============================================================
CREATE TABLE activity (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(32) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_name VARCHAR(128) NOT NULL,
    project_id  UUID,
    metadata    VARCHAR(128),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activity_user_id ON activity(user_id);
CREATE INDEX idx_activity_created_at ON activity(created_at DESC);

-- ============================================================
-- Snippets
-- ============================================================
CREATE TABLE snippets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(512) NOT NULL,
    content      TEXT NOT NULL DEFAULT '',
    blocks       TEXT,
    language     VARCHAR(32) NOT NULL DEFAULT 'text',
    tags         TEXT[] DEFAULT '{}',
    description  VARCHAR(1024),
    is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_snippets_user_id ON snippets(user_id);

-- ============================================================
-- User Keys (E2EE Vault)
-- ============================================================
CREATE TABLE user_keys (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email                 VARCHAR(128),
    public_key            VARCHAR(1024) NOT NULL,
    encrypted_private_key VARCHAR(2048) NOT NULL,
    salt                  VARCHAR(32) NOT NULL,
    iv                    VARCHAR(32) NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_keys_user_id ON user_keys(user_id);

-- ============================================================
-- Access Control (per-resource encrypted key sharing)
-- ============================================================
CREATE TABLE access_control (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id   UUID NOT NULL,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_key VARCHAR(1024) NOT NULL,
    resource_type VARCHAR(32) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (resource_id, user_id)
);
CREATE INDEX idx_access_control_resource_id ON access_control(resource_id);
CREATE INDEX idx_access_control_user_id ON access_control(user_id);

-- ============================================================
-- Resource Versions (snapshots for wiki/snippets/installations)
-- ============================================================
CREATE TABLE resource_versions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id   UUID NOT NULL,
    resource_type VARCHAR(16) NOT NULL,
    content       TEXT NOT NULL,
    title         VARCHAR(512),
    metadata      VARCHAR(1024),
    is_encrypted  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_resource_versions_resource_id ON resource_versions(resource_id);
CREATE INDEX idx_resource_versions_user_id ON resource_versions(user_id);

-- ============================================================
-- Updated-at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all mutable tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wiki_guides_updated_at BEFORE UPDATE ON wiki_guides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_installations_updated_at BEFORE UPDATE ON installations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_snippets_updated_at BEFORE UPDATE ON snippets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_keys_updated_at BEFORE UPDATE ON user_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_access_control_updated_at BEFORE UPDATE ON access_control FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
