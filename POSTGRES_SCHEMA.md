# PostgreSQL Schema

This document reflects the current PostgreSQL schema used by justspace.

## Migration Files

- `backend/migrations/001_initial.up.sql`: base schema
- `backend/migrations/002_task_tags.up.sql`: adds searchable task tags
- `backend/migrations/003_task_dependencies_recurrence.up.sql`: adds task dependencies and recurrence persistence
- `backend/migrations/004_collaboration.up.sql`: adds project members, invitations, and encrypted project files
- `backend/migrations/005_task_file_attachments.up.sql`: scopes project files to optional task attachments
- `backend/migrations/006_task_collaboration_presence.up.sql`: adds task assignees, task comments, task presence, project presence, and task-scoped activity
- `backend/migrations/007_task_description.up.sql`: adds durable task descriptions for new and existing installs
- `backend/migrations/008_task_keys_and_statuses.up.sql`: adds persistent task keys, project-local task workflows, and backfills existing projects/tasks

## Core Tables

### users

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key, generated with `gen_random_uuid()` |
| `email` | `varchar(255)` | Unique login identity |
| `name` | `varchar(255)` | Display name |
| `password_hash` | `varchar(255)` | Backend-managed password hash |
| `preferences` | `jsonb` | User settings payload |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

### projects

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK to `users(id)` |
| `name` | `varchar(512)` | Project title |
| `description` | `text` | Project summary |
| `status` | `varchar(20)` | `todo`, `in-progress`, `completed` |
| `task_key_prefix` | `varchar(16)` | Stable human-facing task key prefix, e.g. `TEST` |
| `next_task_number` | `integer` | Server-side counter for the next issued project task key |
| `days_per_week` | `real` | Optional staffing value |
| `allocated_days` | `integer` | Optional total allocation |
| `is_encrypted` | `boolean` | Vault/E2EE flag |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

Indexes:

- `idx_projects_user_id` on `user_id`
- `idx_projects_task_key_prefix` unique index on `task_key_prefix`

### tasks

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK to `users(id)` |
| `project_id` | `uuid` | FK to `projects(id)` |
| `task_number` | `integer` | Project-local running number used to generate task keys |
| `task_key` | `varchar(32)` | Stable human-readable task key, e.g. `TEST-14` |
| `title` | `varchar(256)` | Task title |
| `description` | `text` | Task description/body shown above subtasks |
| `completed` | `boolean` | Completion flag |
| `parent_id` | `uuid` | Optional self-reference for subtasks |
| `time_spent` | `integer` | Total tracked seconds |
| `is_timer_running` | `boolean` | Active timer state |
| `timer_started_at` | `timestamptz` | Current timer start |
| `time_entries` | `jsonb` | Historical time-entry array |
| `sort_order` | `integer` | Manual ordering key |
| `priority` | `varchar(10)` | `low`, `medium`, `high`, `urgent` |
| `kanban_status` | `varchar(64)` | Project-local workflow key validated against `project_task_statuses` |
| `deadline` | `timestamptz` | Optional deadline |
| `notes` | `jsonb` | Communication/history entries |
| `tags` | `text[]` | Freeform, searchable task tags |
| `dependencies` | `text[]` | Referenced prerequisite task IDs |
| `recurrence` | `text` | JSON recurrence rule (`daily`, `weekly`, `monthly`) |
| `is_encrypted` | `boolean` | Vault/E2EE flag |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

Indexes:

- `idx_tasks_project_id` on `project_id`
- `idx_tasks_user_id` on `user_id`
- `idx_tasks_task_key` unique index on `task_key`
- `idx_tasks_project_task_number` on (`project_id`, `task_number`)
- `idx_tasks_tags` GIN index on `tags`
- `idx_tasks_dependencies` GIN index on `dependencies`

Notes:

- Task tags are stored in plaintext even when task titles are encrypted.
- Tag filtering is implemented client-side with match-all semantics for multiple selected tags.
- Task completion is blocked while incomplete dependencies remain.
- Completing a recurring top-level task creates the next instance automatically using the stored recurrence rule.
- `completed` is now synchronized from the selected workflow state so existing completion logic still works.

### project_task_statuses

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `project_id` | `uuid` | FK to `projects(id)` |
| `key` | `varchar(64)` | Stable workflow key used by tasks and board columns |
| `label` | `varchar(64)` | Human-facing status label |
| `color_token` | `varchar(16)` | HeroUI-aligned token: `default`, `accent`, `warning`, `danger`, `success` |
| `position` | `integer` | Project-local workflow order / board column order |
| `is_completed_state` | `boolean` | Marks statuses that should set tasks to completed |
| `is_builtin` | `boolean` | Protects seeded statuses such as `done` from destructive deletion |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

Indexes / constraints:

- Unique on (`project_id`, `key`)
- Unique on (`project_id`, `position`)

Notes:

- New projects seed this table from `users.preferences.taskStatusTemplates`.
- Projects own their workflow after seeding; later workspace template edits do not retroactively rewrite existing project workflows.

### wiki_guides

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK to `users(id)` |
| `title` | `varchar(512)` | Guide title |
| `description` | `text` | Markdown-capable summary |
| `is_encrypted` | `boolean` | Vault/E2EE flag |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

### installations

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK to `users(id)` |
| `guide_id` | `uuid` | FK to `wiki_guides(id)` |
| `target` | `varchar(512)` | Installation target/environment |
| `git_repo` | `varchar(512)` | Optional repository link |
| `documentation` | `varchar(512)` | Optional docs link |
| `notes` | `text` | Target-specific notes |
| `tasks` | `jsonb` | Installation checklist |
| `is_encrypted` | `boolean` | Vault/E2EE flag |
| `iv` | `varchar(32)` | Optional IV for encrypted content |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

### activity

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK to `users(id)` |
| `type` | `varchar(32)` | `create`, `update`, `complete`, `delete`, `work` |
| `entity_type` | `varchar(32)` | `Project`, `Task`, `Wiki`, `Installation`, `Snippet` |
| `entity_name` | `varchar(128)` | Human-readable entity name |
| `project_id` | `uuid` | Optional related project |
| `task_id` | `uuid` | Optional related task |
| `metadata` | `varchar(128)` | Optional detail text |
| `created_at` | `timestamptz` | Event timestamp |

Indexes:

- `idx_activity_task_id` on `task_id`

### project_members

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `project_id` | `uuid` | FK to `projects(id)` |
| `user_id` | `uuid` | FK to `users(id)` |
| `role` | `varchar(16)` | `owner`, `admin`, `editor`, `viewer` |
| `joined_at` | `timestamptz` | Membership acceptance timestamp |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

Indexes:

- `idx_project_members_project_id` on `project_id`
- `idx_project_members_user_id` on `user_id`

Notes:

- Existing projects are backfilled with one `owner` membership for `projects.user_id`.
- Project access, task access, and collaboration broadcasts now resolve through project membership rather than ownership alone.

### team_invitations

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `project_id` | `uuid` | FK to `projects(id)` |
| `invited_by_id` | `uuid` | FK to `users(id)` |
| `invited_user_id` | `uuid` | Optional FK to `users(id)` |
| `email` | `varchar(255)` | Invite target email |
| `role` | `varchar(16)` | `admin`, `editor`, `viewer` |
| `token_hash` | `varchar(255)` | SHA-256 hash of the invite token |
| `status` | `varchar(16)` | `pending`, `accepted`, `cancelled`, `expired` |
| `expires_at` | `timestamptz` | Invite validity window |
| `accepted_at` | `timestamptz` | Acceptance timestamp |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

Indexes:

- `idx_team_invitations_project_id` on `project_id`
- `idx_team_invitations_email` on `email`

Notes:

- Encrypted projects currently require the invite target to already exist and have a vault so the project key can be wrapped before acceptance.

### project_files

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `project_id` | `uuid` | FK to `projects(id)` |
| `task_id` | `uuid` | Optional FK to `tasks(id)` for task attachments |
| `uploader_id` | `uuid` | FK to `users(id)` |
| `encrypted_name` | `text` | Client-encrypted file name or plain fallback |
| `content_type` | `varchar(255)` | Original MIME type |
| `iv` | `varchar(128)` | AES-GCM IV for encrypted file blobs |
| `size_bytes` | `bigint` | Stored ciphertext size |
| `storage_path` | `varchar(1024)` | Local blob storage path |
| `is_encrypted` | `boolean` | File ciphertext flag |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

Indexes:

- `idx_project_files_project_id` on `project_id`
- `idx_project_files_task_id` on `task_id`
- `idx_project_files_uploader_id` on `uploader_id`

Notes:

- Rows with `task_id IS NULL` are project-level collaboration files.
- Rows with `task_id` set are task attachments stored through the same encrypted file pipeline.

### task_assignees

| Column | Type | Notes |
| --- | --- | --- |
| `task_id` | `uuid` | FK to `tasks(id)` |
| `user_id` | `uuid` | FK to `users(id)` |
| `assigned_by_id` | `uuid` | FK to `users(id)` |
| `created_at` | `timestamptz` | Assignment timestamp |

Indexes:

- Primary key on (`task_id`, `user_id`)
- `idx_task_assignees_user_id` on `user_id`

### task_comments

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `task_id` | `uuid` | FK to `tasks(id)` |
| `user_id` | `uuid` | FK to `users(id)` |
| `body` | `text` | Comment body, encrypted client-side when the task is encrypted |
| `mentioned_user_ids` | `text[]` | Mentioned teammate user IDs |
| `is_encrypted` | `boolean` | Comment ciphertext flag |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

Indexes:

- `idx_task_comments_task_id` on `task_id`
- `idx_task_comments_user_id` on `user_id`

### project_presence

| Column | Type | Notes |
| --- | --- | --- |
| `project_id` | `uuid` | FK to `projects(id)` |
| `user_id` | `uuid` | FK to `users(id)` |
| `last_seen` | `timestamptz` | Latest presence heartbeat |

Indexes:

- Primary key on (`project_id`, `user_id`)

### task_presence

| Column | Type | Notes |
| --- | --- | --- |
| `task_id` | `uuid` | FK to `tasks(id)` |
| `user_id` | `uuid` | FK to `users(id)` |
| `last_seen` | `timestamptz` | Latest presence heartbeat |

Indexes:

- Primary key on (`task_id`, `user_id`)

### snippets

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK to `users(id)` |
| `title` | `varchar(512)` | Snippet title |
| `content` | `text` | Primary content |
| `blocks` | `text` | Optional multi-block JSON payload |
| `language` | `varchar(32)` | Syntax language |
| `tags` | `text[]` | Searchable snippet tags |
| `description` | `varchar(1024)` | Optional description |
| `is_encrypted` | `boolean` | Vault/E2EE flag |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

### user_keys

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK to `users(id)` |
| `email` | `varchar(128)` | Optional cached email |
| `public_key` | `varchar(1024)` | Public key material |
| `encrypted_private_key` | `varchar(2048)` | Private key encrypted with vault password |
| `salt` | `varchar(32)` | Password-derivation salt |
| `iv` | `varchar(32)` | Encryption IV |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

### access_control

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `resource_id` | `uuid` | Related encrypted resource |
| `user_id` | `uuid` | FK to `users(id)` |
| `encrypted_key` | `varchar(1024)` | Wrapped document key |
| `resource_type` | `varchar(32)` | Resource discriminator |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

### resource_versions

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK to `users(id)` |
| `resource_id` | `uuid` | Related resource |
| `resource_type` | `varchar(16)` | `Wiki`, `Snippet`, `Installation` |
| `content` | `text` | Snapshot payload |
| `title` | `varchar(512)` | Optional snapshot title |
| `metadata` | `varchar(1024)` | Optional change metadata |
| `is_encrypted` | `boolean` | Vault/E2EE flag |
| `created_at` | `timestamptz` | Snapshot timestamp |

## Triggers

The schema defines one shared trigger function, `update_updated_at_column()`, and applies it to all mutable tables so `updated_at` changes automatically on updates.

## Operational Notes

- The frontend expects migration files in `backend/migrations` to be applied before the app starts.
- If you add or change task metadata, update both the Go structs in `backend/internal/models/models.go` and the repository scan/return column lists in `backend/internal/repository/repository.go`.
- Encrypted projects currently encrypt task titles, while task tags remain plaintext to support filtering.
- Collaboration file blobs are stored on disk under `FILE_STORAGE_ROOT` and tracked in `project_files`.
- New collaboration-related runtime variables:
  `FILE_STORAGE_ROOT` defaults to `/data/uploads`
  `MAX_UPLOAD_BYTES` defaults to `52428800`
