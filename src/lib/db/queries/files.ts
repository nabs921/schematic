import { query } from '../index';

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasData {
  notes?: Array<{
    id: string;
    title: string;
    content: string;
    color: string;
    position: CanvasPosition;
  }>;
  positions?: Record<string, CanvasPosition>;
  [key: string]: unknown;
}

export interface DiagramFile {
  id: string;
  name: string;
  folder_id: string | null;
  owner_id: string;
  sql_content: string;
  canvas_data: CanvasData;
  created_at: string;
  updated_at: string;
}

export interface CanvasNote {
  id: string;
  file_id: string;
  title: string;
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

export interface FileWithDetails extends DiagramFile {
  owner_name?: string;
  owner_email?: string;
  role?: 'owner' | 'editor' | 'viewer';
}

export const DEFAULT_SQL_STARTER = `-- E-Commerce Database Schema
-- Collaborative SQL Schema Designer

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) UNIQUE NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  inventory_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  total_amount_cents INT NOT NULL,
  shipping_address TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price_cents INT NOT NULL
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

export async function createFile(data: {
  name: string;
  folderId?: string | null;
  ownerId: string;
  sqlContent?: string;
  canvasData?: CanvasData;
}): Promise<DiagramFile> {
  const sql = data.sqlContent !== undefined ? data.sqlContent : DEFAULT_SQL_STARTER;
  const canvas = data.canvasData || {};

  const res = await query<DiagramFile>(
    `INSERT INTO files (name, folder_id, owner_id, sql_content, canvas_data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.name.trim(), data.folderId || null, data.ownerId, sql, JSON.stringify(canvas)]
  );

  return res.rows[0];
}

export async function getFileById(id: string): Promise<DiagramFile | null> {
  const res = await query<DiagramFile>(
    'SELECT * FROM files WHERE id = $1 LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

export async function getFolderFiles(folderId: string | null, userId: string): Promise<FileWithDetails[]> {
  const sql = folderId === null
    ? `SELECT f.*, u.name as owner_name, u.email as owner_email,
         CASE
           WHEN f.owner_id = $1 THEN 'owner'
           WHEN fm.user_id IS NOT NULL THEN
             CASE WHEN fm.role = 'editor' THEN 'editor' ELSE 'viewer' END
           ELSE NULL
         END as role
       FROM files f
       JOIN users u ON f.owner_id = u.id
       LEFT JOIN file_members fm ON f.id = fm.file_id AND fm.user_id = $1
       WHERE f.folder_id IS NULL AND (f.owner_id = $1 OR fm.user_id = $1)
       ORDER BY f.updated_at DESC`
    : `WITH RECURSIVE folder_chain AS (
         SELECT
           f.id,
           f.parent_id,
           0 AS depth,
           CASE WHEN f.owner_id = $1 THEN 'owner' ELSE fm.role END AS role,
           (f.owner_id = $1 OR fm.user_id IS NOT NULL) AS is_direct
         FROM folders f
         LEFT JOIN folder_members fm ON fm.folder_id = f.id AND fm.user_id = $1
         WHERE f.id = $2

         UNION ALL

         SELECT
           parent.id,
           parent.parent_id,
           folder_chain.depth + 1,
           CASE
             WHEN parent.owner_id = $1 THEN 'owner'
             ELSE parent_fm.role
           END,
           (parent.owner_id = $1 OR parent_fm.user_id IS NOT NULL) AS is_direct
         FROM folders parent
         JOIN folder_chain ON parent.id = folder_chain.parent_id
         LEFT JOIN folder_members parent_fm
           ON parent_fm.folder_id = parent.id AND parent_fm.user_id = $1
         WHERE folder_chain.depth < 100
       ),
       effective AS (
         SELECT CASE
           WHEN role = 'owner' THEN 'owner'
           WHEN role = 'editor' THEN 'editor'
           ELSE 'viewer'
         END AS role
         FROM folder_chain
         WHERE role IS NOT NULL
         ORDER BY is_direct DESC, depth ASC
         LIMIT 1
       )
       SELECT f.*, u.name as owner_name, u.email as owner_email,
         CASE
           WHEN f.owner_id = $1 THEN 'owner'
           WHEN fm.user_id IS NOT NULL THEN
             CASE WHEN fm.role = 'editor' THEN 'editor' ELSE 'viewer' END
           ELSE (SELECT role FROM effective)
         END as role
       FROM files f
       JOIN users u ON f.owner_id = u.id
       LEFT JOIN file_members fm ON f.id = fm.file_id AND fm.user_id = $1
       WHERE f.folder_id = $2
         AND (
           f.owner_id = $1
           OR fm.user_id = $1
           OR EXISTS (SELECT 1 FROM effective)
         )
       ORDER BY f.updated_at DESC`;

  const params = folderId === null ? [userId] : [userId, folderId];
  const res = await query<FileWithDetails>(sql, params);
  return res.rows;
}

export async function getAllUserFiles(userId: string): Promise<FileWithDetails[]> {
  const res = await query<FileWithDetails>(
    `WITH RECURSIVE accessible AS (
       SELECT
         f.id,
         f.parent_id,
         0 AS depth,
         CASE WHEN f.owner_id = $1 THEN 'owner' ELSE fm.role END AS role,
         (f.owner_id = $1 OR fm.user_id IS NOT NULL) AS direct
       FROM folders f
       LEFT JOIN folder_members fm ON fm.folder_id = f.id AND fm.user_id = $1
       WHERE f.owner_id = $1 OR fm.user_id = $1

       UNION ALL

       SELECT
         child.id,
         child.parent_id,
         accessible.depth + 1,
         CASE
           WHEN child.owner_id = $1 THEN 'owner'
           ELSE COALESCE(child_fm.role, accessible.role)
         END,
         (child.owner_id = $1 OR child_fm.user_id IS NOT NULL) AS direct
       FROM folders child
       JOIN accessible ON child.parent_id = accessible.id
       LEFT JOIN folder_members child_fm
         ON child_fm.folder_id = child.id AND child_fm.user_id = $1
       WHERE accessible.depth < 100
     ),
     ranked AS (
       SELECT DISTINCT ON (id) id, role
       FROM accessible
       WHERE role IS NOT NULL
       ORDER BY
         id,
         direct DESC,
         CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END
     )
     SELECT f.*, u.name as owner_name, u.email as owner_email,
       CASE
         WHEN f.owner_id = $1 THEN 'owner'
         WHEN fm.user_id IS NOT NULL THEN
           CASE WHEN fm.role = 'editor' THEN 'editor' ELSE 'viewer' END
         WHEN ranked.role = 'owner' THEN 'owner'
         WHEN ranked.role = 'editor' THEN 'editor'
         ELSE 'viewer'
       END as role
     FROM files f
     JOIN users u ON f.owner_id = u.id
     LEFT JOIN file_members fm ON f.id = fm.file_id AND fm.user_id = $1
     LEFT JOIN ranked ON f.folder_id = ranked.id
     WHERE f.owner_id = $1 OR fm.user_id = $1 OR ranked.id IS NOT NULL
     ORDER BY f.updated_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function updateFileSql(id: string, sqlContent: string): Promise<boolean> {
  const res = await query(
    `UPDATE files 
     SET sql_content = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [sqlContent, id]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function updateFileCanvas(id: string, canvasData: CanvasData): Promise<boolean> {
  const res = await query(
    `UPDATE files 
     SET canvas_data = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [JSON.stringify(canvasData), id]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function renameFile(id: string, name: string): Promise<DiagramFile | null> {
  const res = await query<DiagramFile>(
    `UPDATE files 
     SET name = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [name.trim(), id]
  );
  return res.rows[0] || null;
}

export async function moveFile(id: string, newFolderId: string | null): Promise<DiagramFile | null> {
  const res = await query<DiagramFile>(
    `UPDATE files 
     SET folder_id = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [newFolderId || null, id]
  );
  return res.rows[0] || null;
}

export async function deleteFile(id: string): Promise<boolean> {
  const res = await query('DELETE FROM files WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Every file inside a folder and all of its nested subfolders. Used when a
 * folder membership changes so collaboration access can be re-evaluated for
 * each affected schema room.
 */
export async function getFileIdsInFolderTree(folderId: string): Promise<string[]> {
  const res = await query<{ id: string }>(
    `WITH RECURSIVE folder_tree AS (
       SELECT id, 0 AS depth FROM folders WHERE id = $1

       UNION ALL

       SELECT child.id, folder_tree.depth + 1
       FROM folders child
       JOIN folder_tree ON child.parent_id = folder_tree.id
       WHERE folder_tree.depth < 100
     )
     SELECT f.id
     FROM files f
     JOIN folder_tree ON f.folder_id = folder_tree.id`,
    [folderId]
  );

  return res.rows.map((row) => row.id);
}

// Canvas Notes functions
export async function getCanvasNotes(fileId: string): Promise<CanvasNote[]> {
  const res = await query<CanvasNote>(
    'SELECT * FROM canvas_notes WHERE file_id = $1 ORDER BY created_at',
    [fileId]
  );
  return res.rows;
}

export async function createCanvasNote(data: {
  fileId: string;
  title?: string;
  content?: string;
  color?: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
}): Promise<CanvasNote> {
  const res = await query<CanvasNote>(
    `INSERT INTO canvas_notes (id, file_id, title, content, color, position_x, position_y, width, height)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.fileId,
      data.title || 'Note',
      data.content || '',
      data.color || '#fef08a',
      data.positionX ?? 100,
      data.positionY ?? 100,
      data.width ?? 220,
      data.height ?? 160,
    ]
  );
  return res.rows[0];
}

export async function updateCanvasNote(
  id: string,
  data: {
    title?: string;
    content?: string;
    color?: string;
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
  }
): Promise<CanvasNote | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(data.title);
  }
  if (data.content !== undefined) {
    updates.push(`content = $${paramIndex++}`);
    values.push(data.content);
  }
  if (data.color !== undefined) {
    updates.push(`color = $${paramIndex++}`);
    values.push(data.color);
  }
  if (data.positionX !== undefined) {
    updates.push(`position_x = $${paramIndex++}`);
    values.push(data.positionX);
  }
  if (data.positionY !== undefined) {
    updates.push(`position_y = $${paramIndex++}`);
    values.push(data.positionY);
  }
  if (data.width !== undefined) {
    updates.push(`width = $${paramIndex++}`);
    values.push(data.width);
  }
  if (data.height !== undefined) {
    updates.push(`height = $${paramIndex++}`);
    values.push(data.height);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const res = await query<CanvasNote>(
    `UPDATE canvas_notes SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return res.rows[0] || null;
}

export async function deleteCanvasNote(id: string): Promise<boolean> {
  const res = await query('DELETE FROM canvas_notes WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function syncCanvasNotes(
  fileId: string,
  notes: Array<{ id: string; title: string; content: string; color: string; position: { x: number; y: number } }>
): Promise<void> {
  // Filter out notes with invalid (non-UUID) IDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validNotes = notes.filter((note) => uuidRegex.test(note.id));

  // Get existing notes from DB
  const existingNotes = await getCanvasNotes(fileId);
  const existingIds = new Set(existingNotes.map((n) => n.id));
  const newIds = new Set(validNotes.map((n) => n.id));

  // Delete notes that no longer exist
  for (const note of existingNotes) {
    if (!newIds.has(note.id)) {
      await deleteCanvasNote(note.id);
    }
  }

  // Create or update notes
  for (const note of validNotes) {
    if (existingIds.has(note.id)) {
      await updateCanvasNote(note.id, {
        title: note.title,
        content: note.content,
        color: note.color,
        positionX: note.position.x,
        positionY: note.position.y,
      });
    } else {
      await createCanvasNote({
        fileId,
        title: note.title,
        content: note.content,
        color: note.color,
        positionX: note.position.x,
        positionY: note.position.y,
      });
    }
  }
}
