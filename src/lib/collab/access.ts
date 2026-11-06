import { getCollabControlUrl, getCollabRoomName } from './config';

/**
 * Server-only helpers for telling the collaboration server that a user's access
 * has changed. These are intentionally best-effort: the database is still the
 * source of truth, so a failed notification must never fail the share action.
 */

const CONTROL_TIMEOUT_MS = 3000;

async function postControl(
  path: 'kick' | 'allow',
  fileId: string,
  userId: string
): Promise<boolean> {
  const secret = process.env.COLLAB_CONTROL_SECRET?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTROL_TIMEOUT_MS);

  try {
    const response = await fetch(`${getCollabControlUrl()}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-collab-secret': secret } : {}),
      },
      body: JSON.stringify({ room: getCollabRoomName(fileId), userId }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn(
        `[collab] ${path} request for ${fileId}/${userId} failed with ${response.status}.`
      );
      return false;
    }

    return true;
  } catch (error) {
    // The collaboration server may not be running (for example in a build or
    // test environment). Access is still revoked in PostgreSQL, so ignore this.
    console.warn(`[collab] ${path} request for ${fileId}/${userId} failed:`, error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Kick a user out of a schema's open collaboration session. */
export async function revokeCollabAccess(fileId: string, userId: string): Promise<boolean> {
  return postControl('kick', fileId, userId);
}

/** Clear a previous revocation marker so a re-invited user can reconnect. */
export async function restoreCollabAccess(fileId: string, userId: string): Promise<boolean> {
  return postControl('allow', fileId, userId);
}
