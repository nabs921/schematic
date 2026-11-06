import { query } from '../index';

export interface FileCommentRow {
  id: string;
  file_id: string;
  user_id: string;
  parent_id: string | null;
  target: string;
  body: string;
  resolved: boolean;
  created_at: string;
  author_name: string;
  author_color: string;
}

export async function getFileComments(fileId: string): Promise<FileCommentRow[]> {
  const res = await query<FileCommentRow>(
    `SELECT c.id, c.file_id, c.user_id, c.parent_id, c.target, c.body,
            c.resolved, c.created_at, u.name AS author_name,
            u.avatar_color AS author_color
     FROM file_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.file_id = $1
     ORDER BY c.created_at ASC`,
    [fileId]
  );
  return res.rows;
}

export async function getFileCommentById(id: string): Promise<FileCommentRow | null> {
  const res = await query<FileCommentRow>(
    `SELECT c.id, c.file_id, c.user_id, c.parent_id, c.target, c.body,
            c.resolved, c.created_at, u.name AS author_name,
            u.avatar_color AS author_color
     FROM file_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = $1
     LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function createFileComment(data: {
  fileId: string;
  userId: string;
  target: string;
  body: string;
  parentId?: string | null;
}): Promise<FileCommentRow> {
  const res = await query<FileCommentRow>(
    `INSERT INTO file_comments (file_id, user_id, parent_id, target, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, file_id, user_id, parent_id, target, body, resolved, created_at`,
    [data.fileId, data.userId, data.parentId || null, data.target, data.body]
  );

  const created = res.rows[0];
  const userRes = await query<{ name: string; avatar_color: string }>(
    'SELECT name, avatar_color FROM users WHERE id = $1 LIMIT 1',
    [data.userId]
  );

  return {
    ...created,
    author_name: userRes.rows[0]?.name || 'Collaborator',
    author_color: userRes.rows[0]?.avatar_color || '#6366f1',
  };
}

export async function deleteFileComment(id: string): Promise<boolean> {
  const res = await query('DELETE FROM file_comments WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function setFileCommentResolved(id: string, resolved: boolean): Promise<boolean> {
  const res = await query('UPDATE file_comments SET resolved = $1 WHERE id = $2', [
    resolved,
    id,
  ]);
  return (res.rowCount ?? 0) > 0;
}
