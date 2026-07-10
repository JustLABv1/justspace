-- Move legacy task notes into the shared task message stream before removing the
-- old JSONB payload. Existing comments and migrated messages use task_comments.
DO $$
DECLARE
    task_row RECORD;
    raw_note JSONB;
    raw_body TEXT;
    parsed_note JSONB;
    message_body TEXT;
    message_created_at TIMESTAMPTZ;
BEGIN
    FOR task_row IN SELECT id, user_id, created_at, notes FROM tasks LOOP
        FOR raw_note IN SELECT value FROM jsonb_array_elements(COALESCE(task_row.notes, '[]'::jsonb)) LOOP
            raw_body := raw_note #>> '{}';
            parsed_note := NULL;
            message_body := raw_body;
            message_created_at := task_row.created_at;

            BEGIN
                parsed_note := raw_body::jsonb;
                IF jsonb_typeof(parsed_note) = 'object' THEN
                    message_body := COALESCE(parsed_note->>'text', raw_body);
                    BEGIN
                        message_created_at := COALESCE((parsed_note->>'date')::timestamptz, task_row.created_at);
                    EXCEPTION WHEN OTHERS THEN
                        message_created_at := task_row.created_at;
                    END;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Legacy plain-text entries are valid messages as-is.
                message_body := raw_body;
            END;

            INSERT INTO task_comments (task_id, user_id, body, mentioned_user_ids, is_encrypted, created_at, updated_at)
            VALUES (task_row.id, task_row.user_id, COALESCE(message_body, ''), '{}'::text[], FALSE, message_created_at, message_created_at);
        END LOOP;
    END LOOP;
END $$;

ALTER TABLE tasks DROP COLUMN notes;
