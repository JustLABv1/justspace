-- Platform-wide administration, account lifecycle, and OIDC identities.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 0,
    ALTER COLUMN password_hash DROP NOT NULL;

-- Existing deployments get one deterministic bootstrap administrator.
UPDATE users
SET is_platform_admin = TRUE
WHERE id = (
    SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM users WHERE is_platform_admin = TRUE);

CREATE TABLE IF NOT EXISTS platform_settings (
    id                 BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
    local_auth_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS oidc_providers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          VARCHAR(64) NOT NULL UNIQUE,
    name          VARCHAR(128) NOT NULL,
    issuer_url    VARCHAR(1024) NOT NULL,
    client_id     VARCHAR(512) NOT NULL,
    client_secret TEXT NOT NULL DEFAULT '',
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_oidc_identities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES oidc_providers(id) ON DELETE RESTRICT,
    subject     VARCHAR(1024) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_id, subject),
    UNIQUE (user_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_user_oidc_identities_user_id ON user_oidc_identities(user_id);

