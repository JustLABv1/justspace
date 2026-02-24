-- Reverse the initial migration
DROP TRIGGER IF EXISTS update_access_control_updated_at ON access_control;
DROP TRIGGER IF EXISTS update_user_keys_updated_at ON user_keys;
DROP TRIGGER IF EXISTS update_snippets_updated_at ON snippets;
DROP TRIGGER IF EXISTS update_installations_updated_at ON installations;
DROP TRIGGER IF EXISTS update_wiki_guides_updated_at ON wiki_guides;
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

DROP FUNCTION IF EXISTS update_updated_at_column();

DROP TABLE IF EXISTS resource_versions;
DROP TABLE IF EXISTS access_control;
DROP TABLE IF EXISTS user_keys;
DROP TABLE IF EXISTS snippets;
DROP TABLE IF EXISTS activity;
DROP TABLE IF EXISTS installations;
DROP TABLE IF EXISTS wiki_guides;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS users;
