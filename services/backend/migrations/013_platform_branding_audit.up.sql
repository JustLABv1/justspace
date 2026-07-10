-- Global platform branding, operational overview, and administrator audit trail.
ALTER TABLE platform_settings
    ADD COLUMN IF NOT EXISTS brand_name VARCHAR(80) NOT NULL DEFAULT 'justspace',
    ADD COLUMN IF NOT EXISTS brand_logo_key VARCHAR(128),
    ADD COLUMN IF NOT EXISTS brand_logo_updated_at TIMESTAMPTZ;

-- Workspace naming is now global and starts with the platform default.
UPDATE users
SET preferences = preferences - 'workspaceName'
WHERE preferences ? 'workspaceName';

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(64) NOT NULL,
    target_type     VARCHAR(64) NOT NULL,
    target_id       UUID,
    target_label    VARCHAR(255) NOT NULL DEFAULT '',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_user_id ON admin_audit_log(actor_user_id);

CREATE OR REPLACE FUNCTION prevent_admin_audit_mutation() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' AND current_setting('justspace.audit_cleanup', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'admin audit log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_log_immutable ON admin_audit_log;
CREATE TRIGGER admin_audit_log_immutable
    BEFORE UPDATE OR DELETE ON admin_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_mutation();

