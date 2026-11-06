import { query } from '../index';

export type NotificationResourceType = 'file' | 'folder';

export interface ShareNotification {
  id: string;
  resourceType: NotificationResourceType;
  resourceId: string;
  resourceName: string;
  role: 'editor' | 'viewer';
  createdAt: string;
  inviterName: string;
  inviterAvatarColor: string;
}

export interface NotificationFeed {
  notifications: ShareNotification[];
  /** When the recipient last opened the notification feed. */
  seenAt: string;
}

interface NotificationRow {
  id: string;
  resource_type: NotificationResourceType;
  resource_id: string;
  resource_name: string;
  role: 'editor' | 'viewer';
  created_at: Date | string;
  inviter_name: string;
  inviter_avatar_color: string;
}

interface SeenRow {
  notifications_seen_at: Date | string;
}

/**
 * Notifications are derived from the membership rows that grant access, so a
 * removed member also loses the corresponding notification. `invited_by` is
 * used when available; older rows fall back to the resource owner.
 */
export async function getNotificationFeed(
  userId: string,
  limit = 50
): Promise<NotificationFeed> {
  const [feedResult, seenResult] = await Promise.all([
    query<NotificationRow>(
      `WITH feed AS (
         SELECT
           fm.id::text AS id,
           'file'::text AS resource_type,
           f.id::text AS resource_id,
           f.name AS resource_name,
           fm.role::text AS role,
           fm.created_at,
           COALESCE(inviter.name, owner.name) AS inviter_name,
           COALESCE(inviter.avatar_color, owner.avatar_color) AS inviter_avatar_color
         FROM file_members fm
         JOIN files f ON f.id = fm.file_id
         JOIN users owner ON owner.id = f.owner_id
         LEFT JOIN users inviter ON inviter.id = fm.invited_by
         WHERE fm.user_id = $1

         UNION ALL

         SELECT
           fm.id::text,
           'folder'::text,
           fo.id::text,
           fo.name,
           fm.role::text,
           fm.created_at,
           COALESCE(inviter.name, owner.name),
           COALESCE(inviter.avatar_color, owner.avatar_color)
         FROM folder_members fm
         JOIN folders fo ON fo.id = fm.folder_id
         JOIN users owner ON owner.id = fo.owner_id
         LEFT JOIN users inviter ON inviter.id = fm.invited_by
         WHERE fm.user_id = $1
       )
       SELECT *
       FROM feed
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    ),
    query<SeenRow>(
      'SELECT notifications_seen_at FROM users WHERE id = $1 LIMIT 1',
      [userId]
    ),
  ]);

  const seenAt = seenResult.rows[0]?.notifications_seen_at
    ? new Date(seenResult.rows[0].notifications_seen_at).toISOString()
    : new Date(0).toISOString();

  return {
    notifications: feedResult.rows.map((row) => ({
      id: row.id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      resourceName: row.resource_name,
      role: row.role,
      createdAt: new Date(row.created_at).toISOString(),
      inviterName: row.inviter_name,
      inviterAvatarColor: row.inviter_avatar_color,
    })),
    seenAt,
  };
}

export async function markNotificationsSeen(userId: string): Promise<string> {
  const result = await query<SeenRow>(
    `UPDATE users
     SET notifications_seen_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING notifications_seen_at`,
    [userId]
  );

  const seenAt = result.rows[0]?.notifications_seen_at;
  return seenAt ? new Date(seenAt).toISOString() : new Date().toISOString();
}
