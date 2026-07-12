ALTER TABLE snippets DROP COLUMN IF EXISTS collection;
ALTER TABLE snippets DROP COLUMN IF EXISTS project_id;
ALTER TABLE wiki_guides DROP COLUMN IF EXISTS parent_id;
ALTER TABLE wiki_guides DROP COLUMN IF EXISTS project_id;
