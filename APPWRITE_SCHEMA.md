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
| `description` | String | 512 | Yes | Brief overview of the project. |
| `status` | String (Enum) | `todo`, `in-progress`, `completed` | Yes | Current status of the project. |

### 2. Tasks
- **Collection ID:** `tasks`

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `projectId` | String | 36 | Yes | ID of the parent project. |
| `title` | String | 256 | Yes | Task title. |
| `completed` | Boolean | - | Yes | Task completion status. |

### 3. Wiki Guides
- **Collection ID:** `wiki_guides` (Deployment guides hub)

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `title` | String | 128 | Yes | Title of the guide (e.g., "LGTM Stack"). |
| `description` | String | 512 | Yes | High-level overview of the stack. |

### 4. Installations
- **Collection ID:** `installations` (Target-specific details)

| Attribute | Type | Size / Options | Required | Description |
|-----------|------|----------------|----------|-------------|
| `guideId` | String | 36 | Yes | ID of the parent Wiki Guide. |
| `target` | String | 32 | Yes | The target environment (e.g., "Azure", "Linux"). |
| `gitRepo` | String (URL) | 256 | No | URL to the git repository. |
| `documentation` | String (URL) | 256 | No | URL to official documentation. |
| `notes` | String (Markdown) | 2000 | No | Specific installation notes or instructions. |

---

## Initialization Tips
- Ensure your `.env.local` file contains the correct `NEXT_PUBLIC_APPWRITE_PROJECT_ID` and `NEXT_PUBLIC_APPWRITE_DATABASE_ID`.
- You can use the [Appwrite CLI](https://appwrite.io/docs/command-line) to automate the creation of these collections if you have many targets.
