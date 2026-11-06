import { query } from '../index';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface FolderWithDetails extends Folder {
  file_count?: number;
  subfolder_count?: number;
  role?: 'owner' | 'editor' | 'viewer';
}

export async function createFolder(data: {
  name: string;
  parentId?: string | null;
  ownerId: string;
}): Promise<Folder> {
  const res = await query<Folder>(
    `INSERT INTO folders (name, parent_id, owner_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [data.name.trim(), data.parentId || null, data.ownerId]
  );
  return res.rows[0];
}

export async function getFolderById(id: string): Promise<Folder | null> {
  const res = await query<Folder>(
    'SELECT * FROM folders WHERE id = $1 LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

export async function getUserFolders(userId: string): Promise<FolderWithDetails[]> {
  // Walk down from every folder the user owns or belongs to directly so that
  // sharing a parent folder also exposes all of its nested folders. The same
  // recursive walk carries the effective role, which the folder menu uses to
  // decide whether sharing/managing is allowed.
  const res = await query<FolderWithDetails>(
    `WITH RECURSIVE accessible AS (
       SELECT
         f.id,
         f.parent_id,
         0 AS depth,
         CASE WHEN f.owner_id = $1 THEN 'owner' ELSE fm.role END AS role,
         (f.owner_id = $1 OR fm.user_id IS NOT NULL) AS direct
       FROM folders f
       LEFT JOIN folder_members fm ON f.id = fm.folder_id AND fm.user_id = $1
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
     SELECT f.*,
       CASE
         WHEN ranked.role = 'owner' THEN 'owner'
         WHEN ranked.role = 'editor' THEN 'editor'
         ELSE 'viewer'
       END as role,
       (SELECT COUNT(*) FROM files WHERE folder_id = f.id)::int as file_count,
       (SELECT COUNT(*) FROM folders sf WHERE sf.parent_id = f.id)::int as subfolder_count
     FROM folders f
     JOIN ranked ON ranked.id = f.id
     ORDER BY f.name ASC`,
    [userId]
  );
  return res.rows;
}

export async function renameFolder(id: string, name: string): Promise<Folder | null> {
  const res = await query<Folder>(
    `UPDATE folders 
     SET name = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [name.trim(), id]
  );
  return res.rows[0] || null;
}

export async function moveFolder(id: string, newParentId: string | null): Promise<Folder | null> {
  // Prevent moving a folder into itself
  if (id === newParentId) {
    throw new Error('Cannot move folder into itself');
  }

  const res = await query<Folder>(
    `UPDATE folders 
     SET parent_id = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [newParentId || null, id]
  );
  return res.rows[0] || null;
}

export async function deleteFolder(id: string): Promise<boolean> {
  const res = await query('DELETE FROM folders WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function getFolderBreadcrumbs(folderId: string | null): Promise<Folder[]> {
  if (!folderId) return [];

  const crumbs: Folder[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const res: { rows: Folder[] } = await query<Folder>('SELECT * FROM folders WHERE id = $1', [currentId]);
    if (res.rows.length === 0) break;
    const folder: Folder = res.rows[0];
    crumbs.unshift(folder);
    currentId = folder.parent_id;
  }

  return crumbs;
}
