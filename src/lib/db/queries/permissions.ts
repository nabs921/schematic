import { query } from '../index';
import { findUserByEmail, findUserById } from './users';
import { getFileById } from './files';
import { getFolderById } from './folders';

export type UserRole = 'owner' | 'editor' | 'viewer';

/**
 * Membership roles should only ever be `editor` or `viewer`. Older rows (and
 * any malformed writes) may contain an empty/invalid string; treat those as
 * the least-privileged valid role instead of denying access entirely.
 */
function normalizeMemberRole(role: unknown): 'editor' | 'viewer' {
  return role === 'editor' ? 'editor' : 'viewer';
}

export interface PermissionResult {
  hasAccess: boolean;
  role: UserRole | null;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  source: 'owner' | 'file_member' | 'folder_inherited' | 'none';
}

interface MemberRow {
  id: string;
  user_id: string;
  role: MemberInfo['role'];
  created_at: string;
  name: string;
  email: string;
  avatar_color: string;
}

export interface MemberInfo {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_color: string;
  role: 'owner' | 'editor' | 'viewer';
  inherited_from?: string;
  created_at: string;
}

/**
 * Resolves permissions for a file with recursive folder inheritance.
 */
export async function resolveFilePermission(
  userId: string,
  fileId: string
): Promise<PermissionResult> {
  const file = await getFileById(fileId);
  if (!file) {
    return {
      hasAccess: false,
      role: null,
      canEdit: false,
      canDelete: false,
      canShare: false,
      source: 'none',
    };
  }

  // 1. Direct owner of the file
  if (file.owner_id === userId) {
    return {
      hasAccess: true,
      role: 'owner',
      canEdit: true,
      canDelete: true,
      canShare: true,
      source: 'owner',
    };
  }

  // 2. Direct file member permission
  const fileMemberRes = await query<{ role: 'editor' | 'viewer' }>(
    'SELECT role FROM file_members WHERE file_id = $1 AND user_id = $2 LIMIT 1',
    [fileId, userId]
  );

  if (fileMemberRes.rows.length > 0) {
    const role = normalizeMemberRole(fileMemberRes.rows[0].role);
    return {
      hasAccess: true,
      role,
      canEdit: role === 'editor',
      canDelete: false,
      canShare: role === 'editor',
      source: 'file_member',
    };
  }

  // 3. Inherited permission from parent folders
  let currentFolderId = file.folder_id;
  while (currentFolderId) {
    const folder = await getFolderById(currentFolderId);
    if (!folder) break;

    // If user owns the parent folder, they have owner privileges on items inside
    if (folder.owner_id === userId) {
      return {
        hasAccess: true,
        role: 'owner',
        canEdit: true,
        canDelete: true,
        canShare: true,
        source: 'folder_inherited',
      };
    }

    // Check folder member
    const folderMemberRes = await query<{ role: 'editor' | 'viewer' }>(
      'SELECT role FROM folder_members WHERE folder_id = $1 AND user_id = $2 LIMIT 1',
      [currentFolderId, userId]
    );

    if (folderMemberRes.rows.length > 0) {
      const role = normalizeMemberRole(folderMemberRes.rows[0].role);
      return {
        hasAccess: true,
        role,
        canEdit: role === 'editor',
        canDelete: false,
        canShare: role === 'editor',
        source: 'folder_inherited',
      };
    }

    currentFolderId = folder.parent_id;
  }

  return {
    hasAccess: false,
    role: null,
    canEdit: false,
    canDelete: false,
    canShare: false,
    source: 'none',
  };
}

/**
 * Resolves permissions for a folder.
 */
export async function resolveFolderPermission(
  userId: string,
  folderId: string
): Promise<PermissionResult> {
  const folder = await getFolderById(folderId);
  if (!folder) {
    return {
      hasAccess: false,
      role: null,
      canEdit: false,
      canDelete: false,
      canShare: false,
      source: 'none',
    };
  }

  if (folder.owner_id === userId) {
    return {
      hasAccess: true,
      role: 'owner',
      canEdit: true,
      canDelete: true,
      canShare: true,
      source: 'owner',
    };
  }

  // Check direct membership
  const memberRes = await query<{ role: 'editor' | 'viewer' }>(
    'SELECT role FROM folder_members WHERE folder_id = $1 AND user_id = $2 LIMIT 1',
    [folderId, userId]
  );

  if (memberRes.rows.length > 0) {
    const role = normalizeMemberRole(memberRes.rows[0].role);
    return {
      hasAccess: true,
      role,
      canEdit: role === 'editor',
      canDelete: false,
      canShare: role === 'editor',
      source: 'folder_inherited',
    };
  }

  // Traverse up parent folders
  let currentFolderId = folder.parent_id;
  while (currentFolderId) {
    const parentFolder = await getFolderById(currentFolderId);
    if (!parentFolder) break;

    if (parentFolder.owner_id === userId) {
      return {
        hasAccess: true,
        role: 'owner',
        canEdit: true,
        canDelete: true,
        canShare: true,
        source: 'folder_inherited',
      };
    }

    const parentMemberRes = await query<{ role: 'editor' | 'viewer' }>(
      'SELECT role FROM folder_members WHERE folder_id = $1 AND user_id = $2 LIMIT 1',
      [currentFolderId, userId]
    );

    if (parentMemberRes.rows.length > 0) {
      const role = normalizeMemberRole(parentMemberRes.rows[0].role);
      return {
        hasAccess: true,
        role,
        canEdit: role === 'editor',
        canDelete: false,
        canShare: role === 'editor',
        source: 'folder_inherited',
      };
    }

    currentFolderId = parentFolder.parent_id;
  }

  return {
    hasAccess: false,
    role: null,
    canEdit: false,
    canDelete: false,
    canShare: false,
    source: 'none',
  };
}

/**
 * Get all members who have access to a file (including owner and inherited members).
 */
export async function getFileMembers(fileId: string): Promise<MemberInfo[]> {
  const file = await getFileById(fileId);
  if (!file) return [];

  const members: MemberInfo[] = [];

  // Owner
  const owner = await findUserById(file.owner_id);
  if (owner) {
    members.push({
      id: owner.id,
      user_id: owner.id,
      name: owner.name,
      email: owner.email,
      avatar_color: owner.avatar_color,
      role: 'owner',
      created_at: file.created_at,
    });
  }

  // Direct file members
  const directMembersRes = await query<MemberRow>(
    `SELECT fm.id, fm.user_id, fm.role, fm.created_at, u.name, u.email, u.avatar_color
     FROM file_members fm
     JOIN users u ON fm.user_id = u.id
     WHERE fm.file_id = $1`,
    [fileId]
  );

  for (const row of directMembersRes.rows) {
    if (!members.some((m) => m.user_id === row.user_id)) {
      members.push({
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        avatar_color: row.avatar_color,
        role: normalizeMemberRole(row.role),
        created_at: row.created_at,
      });
    }
  }

  // Inherited from folders
  let currentFolderId = file.folder_id;
  while (currentFolderId) {
    const folder = await getFolderById(currentFolderId);
    if (!folder) break;

    const folderMembersRes = await query<MemberRow>(
      `SELECT fm.id, fm.user_id, fm.role, fm.created_at, u.name, u.email, u.avatar_color
       FROM folder_members fm
       JOIN users u ON fm.user_id = u.id
       WHERE fm.folder_id = $1`,
      [currentFolderId]
    );

    for (const row of folderMembersRes.rows) {
      if (!members.some((m) => m.user_id === row.user_id)) {
        members.push({
          id: row.id,
          user_id: row.user_id,
          name: row.name,
          email: row.email,
          avatar_color: row.avatar_color,
          role: normalizeMemberRole(row.role),
          inherited_from: folder.name,
          created_at: row.created_at,
        });
      }
    }

    currentFolderId = folder.parent_id;
  }

  return members;
}

/**
 * Get all members who have access to a folder (including owner, direct members,
 * and members/owners inherited from parent folders).
 */
export async function getFolderMembers(folderId: string): Promise<MemberInfo[]> {
  const folder = await getFolderById(folderId);
  if (!folder) return [];

  const members: MemberInfo[] = [];

  const owner = await findUserById(folder.owner_id);
  if (owner) {
    members.push({
      id: owner.id,
      user_id: owner.id,
      name: owner.name,
      email: owner.email,
      avatar_color: owner.avatar_color,
      role: 'owner',
      created_at: folder.created_at,
    });
  }

  const addMember = (member: MemberInfo) => {
    if (!members.some((existing) => existing.user_id === member.user_id)) {
      members.push(member);
    }
  };

  // Direct members of this folder.
  const directMembersRes = await query<MemberRow>(
    `SELECT fm.id, fm.user_id, fm.role, fm.created_at, u.name, u.email, u.avatar_color
     FROM folder_members fm
     JOIN users u ON fm.user_id = u.id
     WHERE fm.folder_id = $1`,
    [folderId]
  );

  for (const row of directMembersRes.rows) {
    addMember({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      avatar_color: row.avatar_color,
      role: normalizeMemberRole(row.role),
      created_at: row.created_at,
    });
  }

  // Inherited members and owners from parent folders.
  let currentFolderId = folder.parent_id;
  while (currentFolderId) {
    const parent = await getFolderById(currentFolderId);
    if (!parent) break;

    if (parent.owner_id !== folder.owner_id) {
      const parentOwner = await findUserById(parent.owner_id);
      if (parentOwner) {
        addMember({
          id: parentOwner.id,
          user_id: parentOwner.id,
          name: parentOwner.name,
          email: parentOwner.email,
          avatar_color: parentOwner.avatar_color,
          role: 'owner',
          inherited_from: parent.name,
          created_at: parent.created_at,
        });
      }
    }

    const folderMembersRes = await query<MemberRow>(
      `SELECT fm.id, fm.user_id, fm.role, fm.created_at, u.name, u.email, u.avatar_color
       FROM folder_members fm
       JOIN users u ON fm.user_id = u.id
       WHERE fm.folder_id = $1`,
      [currentFolderId]
    );

    for (const row of folderMembersRes.rows) {
      addMember({
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        avatar_color: row.avatar_color,
        role: normalizeMemberRole(row.role),
        inherited_from: parent.name,
        created_at: row.created_at,
      });
    }

    currentFolderId = parent.parent_id;
  }

  return members;
}

export interface ShareResult {
  success: boolean;
  message: string;
  /** The invited user's ID, when the invitation succeeded. */
  userId?: string;
}

/**
 * Share a folder with an email address. Permissions are inherited by every
 * schema and nested folder inside it.
 */
export async function shareFolderWithEmail(
  folderId: string,
  email: string,
  role: 'editor' | 'viewer',
  invitedById?: string
): Promise<ShareResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    return {
      success: false,
      message: `User with email "${email}" not found. Please ask them to sign up first.`,
    };
  }

  const folder = await getFolderById(folderId);
  if (!folder) {
    return { success: false, message: 'Folder not found.' };
  }

  if (folder.owner_id === user.id) {
    return { success: false, message: 'This user is already the owner of this folder.' };
  }

  const safeRole = normalizeMemberRole(role);

  await query(
    `INSERT INTO folder_members (folder_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (folder_id, user_id)
     DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by`,
    [folderId, user.id, safeRole, invitedById ?? null]
  );

  return {
    success: true,
    message: `Access granted to ${user.name} (${safeRole}).`,
    userId: user.id,
  };
}

/**
 * Remove a direct member from a folder.
 */
export async function removeFolderMember(folderId: string, userId: string): Promise<boolean> {
  const res = await query(
    'DELETE FROM folder_members WHERE folder_id = $1 AND user_id = $2',
    [folderId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Share a file with an email address.
 */
export async function shareFileWithEmail(
  fileId: string,
  email: string,
  role: 'editor' | 'viewer',
  invitedById?: string
): Promise<ShareResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    return { success: false, message: `User with email "${email}" not found. Please ask them to sign up first.` };
  }

  const file = await getFileById(fileId);
  if (!file) {
    return { success: false, message: 'File not found.' };
  }

  if (file.owner_id === user.id) {
    return { success: false, message: 'This user is already the owner of this file.' };
  }

  const safeRole = normalizeMemberRole(role);

  await query(
    `INSERT INTO file_members (file_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (file_id, user_id)
     DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by`,
    [fileId, user.id, safeRole, invitedById ?? null]
  );

  return {
    success: true,
    message: `Access granted to ${user.name} (${safeRole}).`,
    userId: user.id,
  };
}

/**
 * Remove a member from a file.
 */
export async function removeFileMember(fileId: string, userId: string): Promise<boolean> {
  const res = await query(
    'DELETE FROM file_members WHERE file_id = $1 AND user_id = $2',
    [fileId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}
