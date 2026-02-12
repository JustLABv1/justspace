# Appwrite Database Schema

This document outlines the required database, collections, and attributes for **justspace**.

## Database
- **Name:** `consultant_hub` (or your preferred name)
- **ID:** Use the ID set in `NEXT_PUBLIC_APPWRITE_DATABASE_ID` in `.env.local`.

---

## Automated Setup

You can use the provided setup script to automatically create the database, collections, and attributes.

### Prerequisites
1.  **Appwrite API Key**: Create an API key in your Appwrite console with the following scopes:
    - `databases.read`
    - `databases.write`
    - `collections.read`
    - `collections.write`
    - `attributes.read`
    - `attributes.write`
    - `indexes.read`
    - `indexes.write`
2.  **Environment Variables**: Ensure your `.env.local` has the following variables:
    ```env
    APPWRITE_API_KEY=your_api_key_here
    NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
    NEXT_PUBLIC_APPWRITE_PROJECT_ID=your_project_id
    NEXT_PUBLIC_APPWRITE_DATABASE_ID=consultant_hub
    ```

### Running the Script
Run the following command in your terminal:
```bash
pnpm run setup:appwrite
```

---

## Collections

### 1. Projects
- **Collection ID:** `projects`
- **Permissions:** `Any` or `Authenticated` (Document-level or Collection-level depending on your security needs)

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `name` | String | 512 | Yes | The name of the consulting project (Large size for encryption). |
| `description` | String | 16384 | Yes | Detailed overview of the project. |
| `status` | String (Enum) | `todo`, `in-progress`, `completed` | Yes | Current status of the project. |
| `daysPerWeek` | Float | - | No | Amount of days the consultant is on this project per week. |
| `allocatedDays` | Integer | - | No | Total number of days allocated for this project. |
| `isEncrypted` | Boolean | - | No | Flag for user-based encryption. |

### 2. Tasks
- **Collection ID:** `tasks`

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `projectId` | String | 36 | Yes | ID of the parent project. |
| `title` | String | 256 | Yes | Task title. |
| `completed` | Boolean | - | No | Task completion status. |
| `parentId` | String | 36 | No | ID of parent task for nesting. |
| `timeSpent` | Integer | - | No | Seconds spent on task. |
| `isTimerRunning` | Boolean | - | No | Active timer status. |
| `timerStartedAt` | String (ISO) | - | No | Time when current timer started. |
| `timeEntries` | String Array | 255 | No | Historical log of time entries (JSON stringified). |
| `order` | Integer | - | No | Display order for DnD. |
| `priority` | String (Enum) | `low`, `medium`, `high`, `urgent` | No | Task priority level. |
| `kanbanStatus` | String (Enum) | `todo`, `in-progress`, `review`, `waiting`, `done` | No | Status for Kanban board. |
| `notes` | String Array | 16384 | No | Communication log. JSON: `{"date": "ISOString", "text": "string", "type": "note|email|call"}` |
| `isEncrypted` | Boolean | - | No | Flag for user-based encryption. |

### 3. Wiki Guides
- **Collection ID:** `wiki_guides` (Deployment guides hub)

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `title` | String | 512 | Yes | Title of the guide (Large size for encryption). |
| `description` | String | 16384 | Yes | High-level (Markdown enabled) overview of the stack. |
| `isEncrypted` | Boolean | - | No | Flag for user-based encryption. |

### 4. Installations
- **Collection ID:** `installations` (Target-specific details)

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `guideId` | String | 36 | Yes | ID of the parent Wiki Guide. |
| `target` | String | 512 | Yes | The target environment (Large size for encryption). |
| `gitRepo` | String (URL) | 512 | No | URL to the git repository. |
| `documentation` | String (URL) | 512 | No | URL to official documentation. |
| `notes` | String (Markdown) | 16384 | No | Specific installation notes or instructions. |
| `tasks` | String Array | 512 | No | Templated checklist tasks to apply to projects. |
| `isEncrypted` | Boolean | - | No | Flag for user-based encryption. |
| `iv` | String | 32 | No | Initialization vector for encrypted content. |

### 7. User Keys
- **Collection ID:** `user_keys`

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `userId` | String | 36 | Yes | ID of the user. |
| `email` | String | 128 | No | Email of the user. |
| `publicKey` | String | 1024 | Yes | Public RSA key (SPKI format). |
| `encryptedPrivateKey` | String | 2048 | Yes | Private RSA key encrypted with vault password. |
| `salt` | String | 32 | Yes | Salt used for password derivation. |
| `iv` | String | 32 | Yes | IV for private key encryption. |

### 8. Access Control
- **Collection ID:** `access_control`

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `resourceId` | String | 36 | Yes | ID of the encrypted resource (e.g., Wiki Guide). |
| `userId` | String | 36 | Yes | ID of the user who has access. |
| `encryptedKey` | String | 1024 | Yes | Resource AES key encrypted with owner's public key for persistence. |
| `resourceType` | String | 32 | Yes | `Wiki`, `Snippet`, etc. |

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
| `title` | String | 512 | Yes | Snippet title (Large size for encryption). |
| `content` | String | 16384 | Yes | Code or text content. |
| `blocks` | String | 16384 | No | JSON stringified multi-block content. |
| `language` | String | 32 | Yes | Programming language for highlighting. |
| `tags` | String Array | 255 | No | Searchable tags. |
| `description` | String | 1024 | No | Additional context. |
| `isEncrypted` | Boolean | - | No | Flag for user-based encryption. |

### 9. Resource Versions
- **Collection ID:** `resource_versions` (Set via `NEXT_PUBLIC_APPWRITE_VERSIONS_COLLECTION_ID`)

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `resourceId` | String | 36 | Yes | ID of the parent resource (Wiki/Snippet). |
| `resourceType` | String | 16 | Yes | `Wiki`, `Snippet`, or `Installation`. |
| `content` | String | 16384 | Yes | Content snapshot. |
| `title` | String | 512 | No | Title snapshot (Large size for encryption). |
| `metadata` | String | 1024 | No | Change details. |
| `isEncrypted` | Boolean | - | No | Flag for user-based encryption. |

---

## Permissions Strategy

This project uses **Document Level Security (DLS)** to ensure that data only belongs to the user that created it.

### Collection-Level Permissions
Permissions are automatically managed by `scripts/setup-appwrite.ts`.

- **All collections**:
  - `create(Role.users())`: Any logged-in user can create documents. 
  - Once created, only the owner has access by default via DLS rules.
  - Sharing is disabled. All data is private to the creator.

---

## Initialization Tips
- Ensure your `.env.local` file contains the correct `NEXT_PUBLIC_APPWRITE_PROJECT_ID`, `NEXT_PUBLIC_APPWRITE_DATABASE_ID`, and all `COLLECTION_ID` variables (e.g., `NEXT_PUBLIC_APPWRITE_VERSIONS_COLLECTION_ID`).
- You can use the [Appwrite CLI](https://appwrite.io/docs/command-line) to automate the creation of these collections if you have many targets.
