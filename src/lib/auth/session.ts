import { cookies } from 'next/headers';
import { query } from '../db';
import { SafeUser } from '../db/queries/users';
import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'schematic_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await query(
    `INSERT INTO sessions (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt.toISOString()]
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });

  return token;
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  return sessionCookie?.value || null;
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await query<SafeUser>(
    `SELECT u.id, u.email, u.name, u.avatar_color, u.created_at, u.updated_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [token]
  );

  if (res.rows.length === 0) {
    // If expired, clean up cookie
    return null;
  }

  return res.rows[0];
}

export async function destroySession(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    await query('DELETE FROM sessions WHERE token = $1', [token]);
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getUserFromToken(token: string): Promise<SafeUser | null> {
  if (!token) return null;

  const res = await query<SafeUser>(
    `SELECT u.id, u.email, u.name, u.avatar_color, u.created_at, u.updated_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [token]
  );

  return res.rows[0] || null;
}
