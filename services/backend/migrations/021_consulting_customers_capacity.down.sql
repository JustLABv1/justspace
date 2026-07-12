DROP TABLE IF EXISTS project_member_allocations;
ALTER TABLE workspace_members DROP COLUMN IF EXISTS weekly_capacity_days;
ALTER TABLE projects DROP COLUMN IF EXISTS hour_budget;
ALTER TABLE projects DROP COLUMN IF EXISTS client_id;
DROP TABLE IF EXISTS customers;
