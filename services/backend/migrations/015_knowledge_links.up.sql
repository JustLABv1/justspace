-- Optional project links and reusable snippet collections.
ALTER TABLE wiki_guides ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE wiki_guides ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES wiki_guides(id) ON DELETE SET NULL;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS collection VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_wiki_guides_project_id ON wiki_guides(project_id);
CREATE INDEX IF NOT EXISTS idx_wiki_guides_parent_id ON wiki_guides(parent_id);
CREATE INDEX IF NOT EXISTS idx_snippets_project_id ON snippets(project_id);
CREATE INDEX IF NOT EXISTS idx_snippets_collection ON snippets(collection);
