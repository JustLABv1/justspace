# PostgreSQL Schema

This document reflects the current PostgreSQL schema used by justspace.

## Migration Files

- `backend/migrations/001_initial.up.sql`: base schema
- `backend/migrations/002_task_tags.up.sql`: adds searchable task tags

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
| `days_per_week` | `real` | Optional staffing value |
| `allocated_days` | `integer` | Optional total allocation |
| `is_encrypted` | `boolean` | Vault/E2EE flag |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

Indexes:

- `idx_projects_user_id` on `user_id`

### tasks

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK to `users(id)` |
| `project_id` | `uuid` | FK to `projects(id)` |
| `title` | `varchar(256)` | Task title |
| `completed` | `boolean` | Completion flag |
| `parent_id` | `uuid` | Optional self-reference for subtasks |
| `time_spent` | `integer` | Total tracked seconds |
| `is_timer_running` | `boolean` | Active timer state |
| `timer_started_at` | `timestamptz` | Current timer start |
| `time_entries` | `jsonb` | Historical time-entry array |
| `sort_order` | `integer` | Manual ordering key |
| `priority` | `varchar(10)` | `low`, `medium`, `high`, `urgent` |
| `kanban_status` | `varchar(20)` | `todo`, `in-progress`, `review`, `waiting`, `done` |
| `deadline` | `timestamptz` | Optional deadline |
| `notes` | `jsonb` | Communication/history entries |
| `tags` | `text[]` | Freeform, searchable task tags |
| `is_encrypted` | `boolean` | Vault/E2EE flag |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

Indexes:

- `idx_tasks_project_id` on `project_id`
- `idx_tasks_user_id` on `user_id`
- `idx_tasks_tags` GIN index on `tags`

Notes:

- Task tags are stored in plaintext even when task titles are encrypted.
- Tag filtering is implemented client-side with match-all semantics for multiple selected tags.

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
| `metadata` | `varchar(128)` | Optional detail text |
| `created_at` | `timestamptz` | Event timestamp |

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
