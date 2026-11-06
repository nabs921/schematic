'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  addCommentAction,
  deleteCommentAction,
  getCommentsAction,
  setCommentResolvedAction,
} from '@/lib/comments/actions';
import type { FileCommentRow } from '@/lib/db/queries/comments';
import { commentTargetKey } from './types';
import type { CommentTarget, CommentThread, FileComment } from './types';

interface CommentsContextValue {
  activeTarget: CommentTarget | null;
  activeThreads: CommentThread[];
  openComments: (target: CommentTarget) => void;
  closeComments: () => void;
  tableCommentCount: (table: string) => number;
  unresolvedCount: number;
  isLoading: boolean;
  error: Error | null;
  currentUserId: string;
  addComment: (target: string, body: string, parentId?: string | null) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  setResolved: (commentId: string, resolved: boolean) => Promise<void>;
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

function toComment(row: FileCommentRow): FileComment {
  return {
    id: row.id,
    fileId: row.file_id,
    userId: row.user_id,
    parentId: row.parent_id,
    target: row.target,
    body: row.body,
    resolved: row.resolved,
    createdAt: row.created_at,
    authorName: row.author_name,
    authorColor: row.author_color,
  };
}

export function CommentsProvider({
  fileId,
  currentUserId,
  initialComments,
  realtimeVersion,
  onCommentsChanged,
  children,
}: {
  fileId: string;
  currentUserId: string;
  initialComments: FileCommentRow[];
  realtimeVersion?: number;
  onCommentsChanged?: () => void;
  children: React.ReactNode;
}) {
  const [activeTarget, setActiveTarget] = useState<CommentTarget | null>(null);
  const [comments, setComments] = useState<FileComment[]>(() =>
    initialComments.map(toComment)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refreshComments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await getCommentsAction(fileId);
      setComments(rows.map(toComment));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load comments'));
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  const counts = useMemo(() => {
    const tables = new Map<string, number>();

    for (const comment of comments) {
      if (comment.parentId || comment.resolved) continue;
      const [table] = comment.target.split('::');
      tables.set(table, (tables.get(table) ?? 0) + 1);
    }

    return { tables };
  }, [comments]);

  const activeThreads = useMemo(() => {
    if (!activeTarget) return [];
    const activeKey = commentTargetKey(activeTarget);
    const repliesByParent = new Map<string, FileComment[]>();

    for (const comment of comments) {
      if (!comment.parentId) continue;
      const replies = repliesByParent.get(comment.parentId) ?? [];
      replies.push(comment);
      repliesByParent.set(comment.parentId, replies);
    }

    return comments
      .filter((comment) => !comment.parentId && comment.target === activeKey)
      .map<CommentThread>((comment) => ({
        id: comment.id,
        target: comment.target,
        resolved: comment.resolved,
        comments: [comment, ...(repliesByParent.get(comment.id) ?? [])],
      }))
      .sort((a, b) => Number(a.resolved) - Number(b.resolved));
  }, [comments, activeTarget]);

  const unresolvedCount = useMemo(
    () =>
      comments.reduce(
        (count, comment) =>
          count + (!comment.parentId && !comment.resolved ? 1 : 0),
        0
      ),
    [comments]
  );

  const openComments = useCallback(
    (target: CommentTarget) => {
      setActiveTarget(target);
      void refreshComments();
    },
    [refreshComments]
  );

  // When the collaboration session signals that another client changed the
  // comment table, refetch from PostgreSQL so threads/counts update live.
  const lastRealtimeVersionRef = useRef(realtimeVersion);
  useEffect(() => {
    if (realtimeVersion === undefined) return;
    if (realtimeVersion === lastRealtimeVersionRef.current) return;

    lastRealtimeVersionRef.current = realtimeVersion;
    void refreshComments();
  }, [realtimeVersion, refreshComments]);

  const closeComments = useCallback(() => {
    setActiveTarget(null);
  }, []);

  const tableCommentCount = useCallback(
    (table: string) => counts.tables.get(table) ?? 0,
    [counts]
  );

  const addComment = useCallback(
    async (target: string, body: string, parentId?: string | null) => {
      await addCommentAction(fileId, target, body, parentId);
      await refreshComments();
      onCommentsChanged?.();
    },
    [fileId, refreshComments, onCommentsChanged]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      await deleteCommentAction(commentId);
      await refreshComments();
      onCommentsChanged?.();
    },
    [refreshComments, onCommentsChanged]
  );

  const setResolved = useCallback(
    async (commentId: string, resolved: boolean) => {
      await setCommentResolvedAction(commentId, resolved);
      await refreshComments();
      onCommentsChanged?.();
    },
    [refreshComments, onCommentsChanged]
  );

  const value = useMemo<CommentsContextValue>(
    () => ({
      activeTarget,
      activeThreads,
      openComments,
      closeComments,
      tableCommentCount,
      unresolvedCount,
      isLoading,
      error,
      currentUserId,
      addComment,
      deleteComment,
      setResolved,
    }),
    [
      activeTarget,
      activeThreads,
      openComments,
      closeComments,
      tableCommentCount,
      unresolvedCount,
      isLoading,
      error,
      currentUserId,
      addComment,
      deleteComment,
      setResolved,
    ]
  );

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>;
}

export function useComments(): CommentsContextValue {
  const context = useContext(CommentsContext);
  if (!context) {
    throw new Error('useComments must be used inside a CommentsProvider');
  }
  return context;
}
