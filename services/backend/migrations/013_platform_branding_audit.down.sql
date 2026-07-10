DROP TRIGGER IF EXISTS admin_audit_log_immutable ON admin_audit_log;
DROP FUNCTION IF EXISTS prevent_admin_audit_mutation();
DROP TABLE IF EXISTS admin_audit_log;
ALTER TABLE platform_settings
    DROP COLUMN IF EXISTS brand_logo_updated_at,
    DROP COLUMN IF EXISTS brand_logo_key,
    DROP COLUMN IF EXISTS brand_name;
