DROP TABLE IF EXISTS user_oidc_identities;
DROP TABLE IF EXISTS oidc_providers;
DROP TABLE IF EXISTS platform_settings;
ALTER TABLE users
    DROP COLUMN IF EXISTS session_version,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS is_platform_admin;
-- password_hash is intentionally not made NOT NULL again because OIDC-only
-- identities may exist after this migration has been applied.
