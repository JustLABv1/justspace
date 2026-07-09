DROP TRIGGER IF EXISTS update_project_files_updated_at ON project_files;
DROP TRIGGER IF EXISTS update_team_invitations_updated_at ON team_invitations;
DROP TRIGGER IF EXISTS update_project_members_updated_at ON project_members;

DROP TABLE IF EXISTS project_files;
DROP TABLE IF EXISTS team_invitations;
DROP TABLE IF EXISTS project_members;
