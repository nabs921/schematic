'use server';

import { getCurrentUser } from '@/lib/auth/session';
import { resolveFilePermission } from '@/lib/db/queries/permissions';
import {
  createFileComment,
  deleteFileComment,
  getFileCommentById,
  getFileComments,
  setFileCommentResolved,
} from '@/lib/db/queries/comments';

export async function getCommentsAction(fileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const permission = await resolveFilePermission(user.id, fileId);
  if (!permission.hasAccess) throw new Error('Access denied');

  return getFileComments(fileId);
}

export async function addCommentAction(
  fileId: string,
  target: string,
  body: string,
  parentId?: string | null
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const permission = await resolveFilePermission(user.id, fileId);
  if (!permission.canEdit) {
    throw new Error('You do not have permission to comment on this file.');
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) throw new Error('Comment cannot be empty.');

  let resolvedTarget = target;

  // Replies inherit the target of their root comment so the thread stays
  // attached to the same table/column.
  if (parentId) {
    const parent = await getFileCommentById(parentId);
    if (!parent || parent.file_id !== fileId) {
      throw new Error('Comment thread not found.');
    }
    resolvedTarget = parent.target;
  }

  return createFileComment({
    fileId,
    userId: user.id,
    target: resolvedTarget,
    body: trimmedBody.slice(0, 10_000),
    parentId,
  });
}

export async function deleteCommentAction(commentId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const comment = await getFileCommentById(commentId);
  if (!comment) throw new Error('Comment not found.');

  const permission = await resolveFilePermission(user.id, comment.file_id);
  if (!permission.hasAccess) throw new Error('Access denied');

  if (comment.user_id !== user.id && permission.role !== 'owner') {
    throw new Error('You can only delete your own comments.');
  }

  await deleteFileComment(commentId);
  return { success: true };
}

export async function setCommentResolvedAction(commentId: string, resolved: boolean) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const comment = await getFileCommentById(commentId);
  if (!comment) throw new Error('Comment not found.');

  const permission = await resolveFilePermission(user.id, comment.file_id);
  if (!permission.canEdit) {
    throw new Error('You do not have permission to update comments.');
  }

  if (comment.parent_id) {
    throw new Error('Only the first comment in a thread can be resolved.');
  }

  await setFileCommentResolved(commentId, resolved);
  return { success: true };
}
