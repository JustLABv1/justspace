CREATE TABLE collaboration_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id UUID UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
    is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (task_id IS NOT NULL)
);

CREATE TABLE collaboration_updates (
    document_id UUID NOT NULL REFERENCES collaboration_documents(id) ON DELETE CASCADE,
    sequence BIGINT NOT NULL,
    client_update_id UUID NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    payload BYTEA NOT NULL,
    iv TEXT,
    materialized_description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (document_id, sequence),
    UNIQUE (document_id, client_update_id)
);

CREATE INDEX idx_collaboration_updates_document_sequence
    ON collaboration_updates (document_id, sequence);

CREATE TRIGGER update_collaboration_documents_updated_at
    BEFORE UPDATE ON collaboration_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
