# Appwrite Database Schema

This document outlines the required database, collections, and attributes for **justspace**.

## Database
- **Name:** `consultant_hub` (or your preferred name)
- **ID:** Use the ID set in `NEXT_PUBLIC_APPWRITE_DATABASE_ID` in `.env.local`.

---

## Collections

### 1. Projects
- **Collection ID:** `projects`
- **Permissions:** `Any` or `Authenticated` (Document-level or Collection-level depending on your security needs)

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `name` | String | 128 | Yes | The name of the consulting project. |
| `description` | String | 16384 | Yes | Detailed overview of the project. |
| `status` | String (Enum) | `todo`, `in-progress`, `completed` | Yes | Current status of the project. |
| `daysPerWeek` | Float | - | No | Amount of days the consultant is on this project per week. |
| `allocatedDays` | Integer | - | No | Total number of days allocated for this project. |

### 2. Tasks
- **Collection ID:** `tasks`

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `projectId` | String | 36 | Yes | ID of the parent project. |
| `title` | String | 256 | Yes | Task title. |
| `completed` | Boolean | - | Yes | Task completion status. |
| `parentId` | String | 36 | No | ID of parent task for nesting. |
| `timeSpent` | Integer | - | No | Seconds spent on task. |
| `isTimerRunning` | Boolean | - | No | Active timer status. |
| `timerStartedAt` | String (ISO) | - | No | Time when current timer started. |
| `timeEntries` | String Array | 255 | No | Historical log of time entries (JSON stringified). |
| `order` | Integer | - | No | Display order for DnD. |
| `kanbanStatus` | String (Enum) | `todo`, `in-progress`, `review`, `done` | No | Status for Kanban board. |

### 3. Wiki Guides
- **Collection ID:** `wiki_guides` (Deployment guides hub)

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `title` | String | 128 | Yes | Title of the guide (e.g., "LGTM Stack"). |
| `description` | String | 16384 | Yes | High-level (Markdown enabled) overview of the stack. |

### 4. Installations
- **Collection ID:** `installations` (Target-specific details)

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `guideId` | String | 36 | Yes | ID of the parent Wiki Guide. |
| `target` | String | 64 | Yes | The target environment (e.g., "Azure", "Linux"). |
| `gitRepo` | String (URL) | 512 | No | URL to the git repository. |
| `documentation` | String (URL) | 512 | No | URL to official documentation. |
| `notes` | String (Markdown) | 16384 | No | Specific installation notes or instructions. |
| `tasks` | String Array | 255 | No | Templated checklist tasks to apply to projects. |

### 5. Activity
- **Collection ID:** `activity`

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `type` | String | 32 | Yes | `create`, `update`, `complete`, `delete`, `work`. |
| `entityType` | String | 32 | Yes | `Project`, `Task`, `Wiki`, `Installation`, `Snippet`. |
| `entityName` | String | 128 | Yes | Name of the entity being modified. |
| `projectId` | String | 36 | No | Associated project ID. |
| `metadata` | String | 128 | No | Context like "Worked 2h 30m". |

### 6. Snippets
- **Collection ID:** `snippets`

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `title` | String | 128 | Yes | Title of the snippet. |
| `content` | String | 16384 | Yes | The code or text content. |
| `language` | String | 32 | Yes | Programming language for syntax highlighting. |
| `tags` | String Array | 32 | No | Categorization tags. |
| `description` | String | 512 | No | Short explanation. |

---

## Initialization Tips
- Ensure your `.env.local` file contains the correct `NEXT_PUBLIC_APPWRITE_PROJECT_ID` and `NEXT_PUBLIC_APPWRITE_DATABASE_ID`.
- You can use the [Appwrite CLI](https://appwrite.io/docs/command-line) to automate the creation of these collections if you have many targets.
