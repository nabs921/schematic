import { query } from '../index';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar_color: string;
  created_at: string;
  updated_at: string;
}

export type SafeUser = Omit<User, 'password_hash'>;

const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#3b82f6', // Blue
];

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const res = await query<User>(
    'SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1',
    [normalizedEmail]
  );
  return res.rows[0] || null;
}

export async function findUserById(id: string): Promise<SafeUser | null> {
  const res = await query<SafeUser>(
    'SELECT id, email, name, avatar_color, created_at, updated_at FROM users WHERE id = $1 LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  name: string;
  avatarColor?: string;
}): Promise<SafeUser> {
  const normalizedEmail = data.email.trim().toLowerCase();
  const avatarColor =
    data.avatarColor ||
    AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  const res = await query<SafeUser>(
    `INSERT INTO users (email, password_hash, name, avatar_color)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, avatar_color, created_at, updated_at`,
    [normalizedEmail, data.passwordHash, data.name.trim(), avatarColor]
  );

  return res.rows[0];
}

export async function searchUsers(searchTerm: string): Promise<SafeUser[]> {
  const term = `%${searchTerm.toLowerCase()}%`;
  const res = await query<SafeUser>(
    `SELECT id, email, name, avatar_color, created_at, updated_at 
     FROM users 
     WHERE LOWER(email) LIKE $1 OR LOWER(name) LIKE $1 
     LIMIT 10`,
    [term]
  );
  return res.rows;
}
