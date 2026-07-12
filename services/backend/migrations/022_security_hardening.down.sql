DROP INDEX IF EXISTS idx_project_members_single_owner;
ALTER TABLE user_keys DROP COLUMN IF EXISTS kdf_iterations;
