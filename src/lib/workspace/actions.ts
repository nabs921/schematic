'use server';

import { getCurrentUser } from '@/lib/auth/session';
import {
  createFile,
  renameFile,
  moveFile,
  deleteFile,
  getFileById,
  getFileIdsInFolderTree,
  updateFileSql,
  updateFileCanvas,
  syncCanvasNotes,
} from '@/lib/db/queries/files';
import {
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
} from '@/lib/db/queries/folders';
import {
  resolveFilePermission,
  resolveFolderPermission,
  getFileMembers,
  getFolderMembers,
  shareFileWithEmail,
  removeFileMember,
  shareFolderWithEmail,
  removeFolderMember,
} from '@/lib/db/queries/permissions';
import { SCHEMA_TEMPLATES } from './templates';
import { getNotificationFeed, markNotificationsSeen } from '@/lib/db/queries/notifications';
import { restoreCollabAccess, revokeCollabAccess } from '@/lib/collab/access';
import { revalidatePath } from 'next/cache';

/**
 * Kicks a user from a schema's live collaboration room only when they no longer
 * have access through any path (direct membership or folder inheritance).
 */
async function revokeCollabAccessIfDenied(fileId: string, userId: string): Promise<void> {
  const permission = await resolveFilePermission(userId, fileId);
  if (!permission.hasAccess) {
    await revokeCollabAccess(fileId, userId);
  }
}

export async function createFileAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const name = formData.get('name')?.toString().trim() || 'Untitled Schema';
  const folderId = formData.get('folderId')?.toString() || null;
  const templateKey = formData.get('templateKey')?.toString() || 'ecommerce';

  // Check folder permission if creating in a folder
  if (folderId) {
    const perm = await resolveFolderPermission(user.id, folderId);
    if (!perm.canEdit) {
      throw new Error('You do not have permission to create files in this folder.');
    }
  }

  const template = SCHEMA_TEMPLATES.find((t) => t.key === templateKey);
  const sql = template ? template.sql : '';

  const file = await createFile({
    name,
    folderId,
    ownerId: user.id,
    sqlContent: sql,
  });

  revalidatePath('/dashboard');
  return { success: true, fileId: file.id };
}

export async function renameFileAction(fileId: string, newName: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFilePermission(user.id, fileId);
  if (!perm.canEdit) {
    throw new Error('You do not have permission to rename this file.');
  }

  await renameFile(fileId, newName);
  revalidatePath('/dashboard');
  revalidatePath(`/schema/${fileId}`);
  return { success: true };
}

export async function moveFileAction(fileId: string, targetFolderId: string | null) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFilePermission(user.id, fileId);
  if (!perm.canEdit) {
    throw new Error('You do not have permission to move this file.');
  }

  if (targetFolderId) {
    const targetPerm = await resolveFolderPermission(user.id, targetFolderId);
    if (!targetPerm.canEdit) {
      throw new Error('You do not have permission to add files to the destination folder.');
    }
  }

  await moveFile(fileId, targetFolderId);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function duplicateFileAction(fileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const file = await getFileById(fileId);
  if (!file) throw new Error('File not found');

  const perm = await resolveFilePermission(user.id, fileId);
  if (!perm.hasAccess) throw new Error('Access denied');

  const newFile = await createFile({
    name: `${file.name} (Copy)`,
    folderId: file.folder_id,
    ownerId: user.id,
    sqlContent: file.sql_content,
    canvasData: file.canvas_data,
  });

  revalidatePath('/dashboard');
  return { success: true, fileId: newFile.id };
}

export async function deleteFileAction(fileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFilePermission(user.id, fileId);
  if (!perm.canDelete) {
    throw new Error('Only the owner can delete this file.');
  }

  await deleteFile(fileId);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function createFolderAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const name = formData.get('name')?.toString().trim() || 'New Folder';
  const parentId = formData.get('parentId')?.toString() || null;

  if (parentId) {
    const perm = await resolveFolderPermission(user.id, parentId);
    if (!perm.canEdit) {
      throw new Error('You do not have permission to create subfolders here.');
    }
  }

  const folder = await createFolder({
    name,
    parentId,
    ownerId: user.id,
  });

  revalidatePath('/dashboard');
  return { success: true, folderId: folder.id };
}

export async function renameFolderAction(folderId: string, newName: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFolderPermission(user.id, folderId);
  if (!perm.canEdit) {
    throw new Error('You do not have permission to rename this folder.');
  }

  await renameFolder(folderId, newName);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function moveFolderAction(folderId: string, targetParentId: string | null) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFolderPermission(user.id, folderId);
  if (!perm.canEdit) {
    throw new Error('You do not have permission to move this folder.');
  }

  await moveFolder(folderId, targetParentId);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function deleteFolderAction(folderId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFolderPermission(user.id, folderId);
  if (!perm.canDelete) {
    throw new Error('Only the owner can delete this folder.');
  }

  await deleteFolder(folderId);
  revalidatePath('/dashboard');
  return { success: true };
}

interface CanvasStatePayload {
  notes?: Array<{
    id: string;
    title: string;
    content: string;
    color: string;
    position: { x: number; y: number };
  }>;
  positions?: Record<string, { x: number; y: number }>;
}

export async function saveFileStateAction(
  fileId: string,
  sqlContent: string,
  canvasData?: CanvasStatePayload
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFilePermission(user.id, fileId);
  if (!perm.canEdit) {
    throw new Error('You do not have permission to edit this file.');
  }

  const promises: Promise<unknown>[] = [updateFileSql(fileId, sqlContent)];
  if (canvasData !== undefined) {
    // Sync notes to the canvas_notes table
    if (canvasData.notes && Array.isArray(canvasData.notes)) {
      promises.push(syncCanvasNotes(fileId, canvasData.notes));
    }
    // Still save positions to canvas_data JSONB
    promises.push(updateFileCanvas(fileId, { positions: canvasData.positions }));
  }

  await Promise.all(promises);
  return { success: true };
}

export async function shareFileAction(fileId: string, email: string, role: 'editor' | 'viewer') {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFilePermission(user.id, fileId);
  if (!perm.canShare) {
    throw new Error('You do not have permission to share this file.');
  }

  const safeRole: 'editor' | 'viewer' = role === 'editor' ? 'editor' : 'viewer';
  const res = await shareFileWithEmail(fileId, email, safeRole, user.id);

  // Re-sharing a previously removed collaborator must clear the reconnect
  // block as well as re-granting database access.
  if (res.success && res.userId) {
    await restoreCollabAccess(fileId, res.userId);
  }

  revalidatePath('/dashboard');
  revalidatePath(`/schema/${fileId}`);
  return res;
}

export async function removeFileMemberAction(fileId: string, targetUserId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFilePermission(user.id, fileId);
  if (!perm.canShare) {
    throw new Error('You do not have permission to manage members.');
  }

  await removeFileMember(fileId, targetUserId);

  // If the user still has access through a folder (or another membership),
  // leave their session alone. Otherwise kick them immediately.
  await revokeCollabAccessIfDenied(fileId, targetUserId);

  revalidatePath('/dashboard');
  revalidatePath(`/schema/${fileId}`);
  return { success: true };
}

/**
 * Lightweight fallback used by an open editor when the WebSocket handshake is
 * refused. The collaboration server handles the normal kick path; this makes
 * revocation effective even if the tab was offline when the kick was sent.
 */
export async function checkFileAccessAction(fileId: string) {
  const user = await getCurrentUser();
  if (!user) return { hasAccess: false };

  const perm = await resolveFilePermission(user.id, fileId);
  return { hasAccess: perm.hasAccess };
}

export async function getShareMembersAction(
  resourceType: 'file' | 'folder',
  resourceId: string
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  if (resourceType === 'file') {
    const perm = await resolveFilePermission(user.id, resourceId);
    if (!perm.hasAccess) throw new Error('Access denied');
    return getFileMembers(resourceId);
  }

  const perm = await resolveFolderPermission(user.id, resourceId);
  if (!perm.hasAccess) throw new Error('Access denied');
  return getFolderMembers(resourceId);
}

export async function shareFolderAction(
  folderId: string,
  email: string,
  role: 'editor' | 'viewer'
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFolderPermission(user.id, folderId);
  if (!perm.canShare) {
    throw new Error('You do not have permission to share this folder.');
  }

  const safeRole: 'editor' | 'viewer' = role === 'editor' ? 'editor' : 'viewer';
  const res = await shareFolderWithEmail(folderId, email, safeRole, user.id);

  // Clear any revocation markers for schemas inside the folder so a re-invited
  // collaborator can reconnect to every room they now have access to.
  if (res.success && res.userId) {
    const invitedUserId = res.userId;
    const fileIds = await getFileIdsInFolderTree(folderId);
    await Promise.all(fileIds.map((fileId) => restoreCollabAccess(fileId, invitedUserId)));
  }

  revalidatePath('/dashboard');
  return res;
}

export async function getNotificationsAction() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return getNotificationFeed(user.id);
}

export async function markNotificationsSeenAction() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  const seenAt = await markNotificationsSeen(user.id);
  return { success: true, seenAt };
}

export async function removeFolderMemberAction(folderId: string, targetUserId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const perm = await resolveFolderPermission(user.id, folderId);
  if (!perm.canShare) {
    throw new Error('You do not have permission to manage members.');
  }

  await removeFolderMember(folderId, targetUserId);

  // A folder membership can grant access to many schemas. Re-check each one:
  // another folder membership or a direct file share may still keep them in.
  const fileIds = await getFileIdsInFolderTree(folderId);
  await Promise.all(
    fileIds.map((fileId) => revokeCollabAccessIfDenied(fileId, targetUserId))
  );

  revalidatePath('/dashboard');
  return { success: true };
}
