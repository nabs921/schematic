# Schematic — SQL Schema Designer

A local-first SQL-to-ER diagram application inspired by **dbdiagram.io** and **sqltoerdiagram.com**.

Write PostgreSQL DDL statements in a CodeMirror 6 editor, visualize relational database structures automatically with **React Flow** and **ELK.js**, and keep everything on your own machine. Schematic runs against a local **PostgreSQL** database and needs no cloud services or API keys.

---

## 🚀 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + developer-focused Dark Theme
- **Database**: Local [PostgreSQL](https://www.postgresql.org/) (bundled `docker-compose.yml`)
- **Authentication**: Custom email/password authentication, bcrypt password hashing, HttpOnly secure cookies & session store
- **Code Editor**: [CodeMirror 6](https://codemirror.net/) with PostgreSQL DDL syntax highlighting and in-editor diagnostics
- **SQL Parsing**: [@dbml/core](https://dbml.dbdiagram.io/home/) (PostgreSQL parser & relationship extractor)
- **Diagram Rendering**: [React Flow (@xyflow/react)](https://reactflow.dev/) with custom interactive table nodes & sticky notes
- **Auto Layout**: [ELK.js](https://github.com/kieler/elkjs) layered layout algorithm
- **Real-time Collaboration**: Self-hosted [Yjs](https://yjs.dev/) + [y-websocket](https://github.com/yjs/y-websocket) server (live SQL sync, presence, remote cursors, editing activity)
- **Comments**: Local, database-backed threads attached to tables and columns
- **Package Manager**: [pnpm](https://pnpm.io/)

---

## 🌟 Core Features

### 1. Authentication & Session Security
- **Email/Password sign up & login**: Secure password hashing with `bcryptjs`.
- **HttpOnly Cookies**: Session management stored in the local PostgreSQL `sessions` table with 30-day expiration.
- **Protected Routes**: Automatic redirection between `/login`, `/dashboard`, and `/schema/[id]`.
- **Role Badges & User Profiles**: Customizable avatar color and initials.

### 2. Workspace & Nested Folders
- **Hierarchical Folders**: Multi-level nested folder directories (`parent_id` tree).
- **File Management**: Create, rename, move, duplicate, and delete schema files and folders.
- **Breadcrumb Navigation**: Seamlessly navigate through nested directory paths.
- **Search & Filtering**: Real-time schema search with Grid and List views.
- **Role Tags**: Owner / Editor / Viewer badges appear on folders and schemas shared with you.
- **Pre-packaged Templates**: 1-click starter schemas (E-Commerce, SaaS & Billing, Social Network, Blank Schema).

### 3. Multi-Dialect SQL Editor (CodeMirror 6)
- **Multi-Dialect DDL Support**: Switch between **PostgreSQL**, **MySQL / MariaDB**, **SQLite**, **Microsoft SQL Server (T-SQL)**, and **Oracle** with full syntax highlighting, AST parsing, and real-time validation.
- **Dialect Auto-Detection & Conversion**: Automatic detection of SQL dialects and 1-click cross-dialect DDL conversion (e.g. PostgreSQL to MySQL, MSSQL, SQLite, or Oracle).
- **One Dark Theme**: Developer-focused theme matching modern code editors.
- **Real-time Parsing**: Parses SQL into a relational schema AST via `@dbml/core`.
- **In-Editor Diagnostics**: Maps syntax errors with squiggly lines and line/column numbers.
- **Graceful Fallback**: Retains the last successfully generated diagram when SQL is temporarily invalid during typing.
- **SQL Toolbar**: Keyword formatter, template insert, copy to clipboard, and dialect switcher.
- **Collaborative Undo/Redo**: Yjs-backed undo history with standard CodeMirror keymaps.
- **Live Text Selections**: Remote carets show each collaborator's name and color.

### 4. Interactive ER Diagram (React Flow & ELK.js)
- **Custom Table Nodes**:
  - Primary Key (`PK`, golden key icon)
  - Foreign Key (`FK`, blue link icon)
  - Unique constraint (`UQ` badge)
  - **Color-coded data types**:
    - `UUID` → violet
    - `INT`, `BIGINT`, `SERIAL`, `NUMERIC`, `DECIMAL` → amber
    - `VARCHAR`, `CHAR`, `TEXT` → emerald
    - `BOOLEAN` → rose
    - `DATE`, `TIME`, `TIMESTAMP`, `TIMESTAMPTZ` → cyan
    - `JSON`, `JSONB` → fuchsia
    - `BYTEA`, `BINARY`, `BLOB` → orange
  - Nullability indicators (`?`)
- **Relationship Edges**: Connects foreign key columns directly to primary keys with cardinality labels (`1:N`, `1:1`, `N:M`).
- **ELK.js Layout**: 1-click automatic hierarchical layout arranging tables without overlapping.
- **Sticky Notes**: Add, edit, recolor (yellow, blue, green, purple, rose), move, and delete canvas notes. Note text syncs live while typing, so collaborators see changes without waiting for a blur/save.
- **Controls**: Pan, zoom, minimap toggle, fit-to-view, and high-resolution **PNG diagram export**.

### 5. Local Comments
- **Table & Column Threads**: Comment on a table from its header, or on a column.
- **Replies & Resolution**: Reply to threads and mark them resolved or reopened.
- **Live Updates**: New comments, replies, resolutions, and comment badges appear for every connected collaborator without refreshing.
- **Stored Locally**: Comments live in PostgreSQL (`file_comments`) alongside your schemas.

### 6. Real-time Collaboration (Local WebSocket)
- **Live SQL Sync**: Every keystroke, table drag, and sticky-note edit is synchronized through Yjs over a self-hosted WebSocket server.
- **Remote Presence & Cursors**: See collaborator avatars, their live canvas cursors, text selections in the editor, and “Editing SQL (line X)” / “Moving table” activity.
- **No Cloud Keys**: The collaboration server runs next to the app (`scripts/collab-server.mjs`); no Liveblocks account, API key, or internet connection is needed.
- **Graceful Degradation**: If the collaboration server is not running, editing still works locally and autosaves to PostgreSQL.
- **Trusted Networks Only**: The WebSocket server does not perform authentication. Run it on localhost/LAN, or put it behind a VPN/reverse proxy with access control before exposing it to the internet.

### 7. Sharing & Permission Inheritance
- **Invite by Email**: Grant `editor` or `viewer` roles to teammates on this machine/network.
- **Folder Inheritance**: Files inherit permissions from parent folders and nested ancestors automatically.
- **Member Management**: View all members with direct or inherited access, and manage access levels.

### 8. Offline-Friendly Editing
- **No Cloud Dependencies**: No Neon, Liveblocks, or external APIs are involved.
- **Immediate Draft Backup**: Every SQL edit, note change, and table drag is mirrored to `localStorage`.
- **Automatic Recovery**: If the browser goes offline, the status bar shows *Offline — edits saved locally*. If a save to PostgreSQL fails, the draft is kept locally and pushed automatically when the connection returns.
- **Manual Save**: `Ctrl+S` / `Cmd+S` still saves immediately.

---

## 🗄️ Database Architecture & Schema

Schematic uses a local **PostgreSQL** relational database. All tables use UUID primary keys generated by `gen_random_uuid()` and enforce referential integrity with cascading deletes.

### Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ sessions : "has active"
    users ||--o{ folders : "owns"
    users ||--o{ files : "owns"
    users ||--o{ folder_members : "participates in"
    users ||--o{ file_members : "collaborates on"
    users ||--o{ file_comments : "authors"
    
    folders ||--o{ folders : "parent_id (nested)"
    folders ||--o{ files : "contains"
    folders ||--o{ folder_members : "shared via"

    files ||--o{ file_members : "shared via"
    files ||--o{ canvas_notes : "contains"
    files ||--o{ file_comments : "annotated with"
    file_comments ||--o{ file_comments : "parent_id (replies)"
```

### Table Specifications

#### 1. `users`
Stores user authentication profiles, security credentials, and preferences.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique user identifier |
| `email` | `VARCHAR(255)` | `UNIQUE NOT NULL` | Login email address |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | Bcrypt password hash |
| `name` | `VARCHAR(255)` | `NOT NULL` | Display name for presence & collaboration |
| `avatar_color` | `VARCHAR(32)` | `NOT NULL DEFAULT '#6366f1'` | Hex color assigned to collaborator cursor & badge |
| `notifications_seen_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Last timestamp when notifications feed was marked read |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | `DEFAULT CURRENT_TIMESTAMP` | Creation and modification timestamps |

#### 2. `sessions`
Tracks active HttpOnly cookie authentication sessions.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Session record identifier |
| `user_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Associated user |
| `token` | `VARCHAR(255)` | `UNIQUE NOT NULL` | Cryptographically random session cookie token |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL` | 30-day session expiration date |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT CURRENT_TIMESTAMP` | Session start time |

#### 3. `folders`
Organizes files in a recursive, multi-level directory hierarchy.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Folder identifier |
| `name` | `VARCHAR(255)` | `NOT NULL` | Folder display name |
| `parent_id` | `UUID` | `REFERENCES folders(id) ON DELETE CASCADE` | Parent directory (null for root workspace folders) |
| `owner_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Creator/Owner of the folder |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | `DEFAULT CURRENT_TIMESTAMP` | Timestamps |

#### 4. `files`
Stores the SQL DDL schemas and canvas state.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Schema file identifier |
| `name` | `VARCHAR(255)` | `NOT NULL` | Schema name (e.g. "E-Commerce Schema") |
| `folder_id` | `UUID` | `REFERENCES folders(id) ON DELETE CASCADE` | Enclosing folder (null if placed in root) |
| `owner_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Schema owner with full administrative rights |
| `sql_content` | `TEXT` | `NOT NULL DEFAULT ''` | Current SQL DDL definition statements |
| `canvas_data` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Canvas configuration (dialect, table coordinates) |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | `DEFAULT CURRENT_TIMESTAMP` | Modification timestamps |

##### Structure of `canvas_data` (`JSONB`)
The `canvas_data` column stores document metadata without requiring schema migrations:
```json
{
  "dialect": "postgres",
  "positions": {
    "users": { "x": 120, "y": 80 },
    "orders": { "x": 480, "y": 140 }
  }
}
```
* **`dialect`**: Current SQL dialect (`postgres`, `mysql`, `sqlite`, `mssql`, or `oracle`).
* **`positions`**: Map of table names to custom X/Y coordinates set on the canvas.

#### 5. `folder_members` & `file_members`
Implements granular Role-Based Access Control (RBAC) on folders and individual files.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Membership row identifier |
| `folder_id` / `file_id` | `UUID` | `NOT NULL REFERENCES ... ON DELETE CASCADE` | Shared resource |
| `user_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Invited collaborator |
| `role` | `VARCHAR(32)` | `CHECK (role IN ('editor', 'viewer'))` | Access permission level |
| `invited_by` | `UUID` | `REFERENCES users(id) ON DELETE SET NULL` | User who sent the invitation |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT CURRENT_TIMESTAMP` | Share timestamp |

* **Permission Hierarchy & Inheritance**:
  * **Owner**: Full access (edit SQL/canvas/dialect, rename, move, delete, manage permissions).
  * **Editor**: Can modify SQL, dialect, notes, and layout. Cannot delete or change sharing permissions.
  * **Viewer**: Read-only access. Cannot edit SQL, move nodes, add notes, or change dialects.
  * Permissions granted on parent folders automatically cascade down to nested subfolders and files.

#### 6. `canvas_notes`
Interactive sticky notes placed on the ER diagram canvas.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Note identifier |
| `file_id` | `UUID` | `NOT NULL REFERENCES files(id) ON DELETE CASCADE` | Parent schema file |
| `title` | `VARCHAR(255)` | `NOT NULL DEFAULT 'Note'` | Note heading |
| `content` | `TEXT` | `NOT NULL DEFAULT ''` | Markdown or text content |
| `color` | `VARCHAR(32)` | `NOT NULL DEFAULT '#fef08a'` | Color theme (yellow, blue, green, purple, rose) |
| `position_x` / `position_y` | `DOUBLE PRECISION` | `NOT NULL DEFAULT 100` | Canvas coordinate offsets |
| `width` / `height` | `DOUBLE PRECISION` | `NOT NULL DEFAULT 220 / 160` | Note bounding box size |

#### 7. `file_comments`
Collaborative discussion threads pinned to schema tables or columns.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Comment identifier |
| `file_id` | `UUID` | `NOT NULL REFERENCES files(id) ON DELETE CASCADE` | Associated schema file |
| `user_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Comment author |
| `parent_id` | `UUID` | `REFERENCES file_comments(id) ON DELETE CASCADE` | Root comment (null for top-level threads) |
| `target` | `VARCHAR(255)` | `NOT NULL` | Target anchor (e.g. `table:users` or `col:users.email`) |
| `body` | `TEXT` | `NOT NULL` | Comment message content |
| `resolved` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Thread resolution status |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT CURRENT_TIMESTAMP` | Post timestamp |

---

### Database Migrations (`db/migrations/`)

Database migrations are executed sequentially on startup or via `pnpm run db:migrate`:

1. `001_initial_schema.sql`: Creates core tables (`users`, `sessions`, `folders`, `files`, `folder_members`, `file_members`, `canvas_notes`).
2. `002_migrate_canvas_notes.sql`: Migrates legacy notes from `files.canvas_data` JSONB to the dedicated `canvas_notes` table.
3. `003_cleanup_jsonb_notes.sql`: Removes redundant notes arrays from `files.canvas_data`.
4. `004_notifications.sql`: Adds `notifications_seen_at` to `users` and `invited_by` to member tables.
5. `005_comments.sql`: Creates `file_comments` table with indices for threaded discussions.
6. `006_normalize_member_roles.sql`: Enforces check constraints on `role` (`'editor'` or `'viewer'`).

---

## 🛠️ Getting Started

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Start Local PostgreSQL
The included compose file starts a PostgreSQL 16 container with database `schematic`:

```bash
docker compose up -d
```

If you prefer an existing local PostgreSQL server, create a `schematic` database and point `DATABASE_URL` at it.

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
The defaults match the bundled database:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/schematic"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
COLLAB_HOST="0.0.0.0"
COLLAB_PORT="1234"
# Set this when the collaboration server is on another host:
# NEXT_PUBLIC_COLLAB_WS_URL="ws://192.168.1.20:1234"
# Optional: shared secret for the /kick and /allow control endpoints.
# When unset, only loopback requests are accepted (fine for local dev).
# COLLAB_CONTROL_SECRET="change-me"
```

> No cloud database or collaboration API keys are required.

### 4. Run Database Migrations
```bash
pnpm run db:migrate
```

### 5. Start Development Server
```bash
pnpm dev
```
This starts both Next.js and the local Yjs collaboration server (port `1234`). Open [http://localhost:3000](http://localhost:3000) in your browser.

If you prefer separate terminals:
```bash
pnpm dev:web     # Next.js only
pnpm dev:collab  # Yjs WebSocket server only
```

To share a schema in real time, open the same `/schema/<id>` URL in two browser tabs or on two machines on your LAN. Both clients must be able to reach the WebSocket server (`COLLAB_HOST=0.0.0.0` by default, port `1234`). For production, `pnpm start` starts the web server and collaboration server together; use `pnpm start:web` / `pnpm start:collab` to run them separately.

Removing a collaborator from a schema (or from a folder containing it) immediately closes their open collaboration session and blocks reconnects until they are re-invited. The database remains the source of truth; if the collaboration server is unavailable, revocation still takes effect on the next page load.

---

## 🧪 Testing

Run the local test suite:
```bash
pnpm run test:all
```
This tests migrations, password hashing, session cookies, folder nesting, schema creation, permission inheritance, SQL parsing diagnostics, and ELK.js layout calculation against the local PostgreSQL database.
