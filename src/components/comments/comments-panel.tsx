'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { X, MessageSquare, Check, RotateCcw, Trash2, CornerDownRight, Eye } from 'lucide-react';
import { useComments } from './comments-context';
import { commentTargetKey } from './types';
import type { CommentThread, FileComment } from './types';

interface CommentsPanelProps {
  readOnly: boolean;
  canComment: boolean;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function CommentAuthor({ comment }: { comment: FileComment }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase flex-shrink-0"
        style={{ backgroundColor: comment.authorColor }}
      >
        {comment.authorName.charAt(0)}
      </div>
      <span className="text-xs font-medium text-zinc-200 truncate">
        {comment.authorName}
      </span>
    </div>
  );
}

function CommentRow({
  comment,
  canDelete,
  onDelete,
}: {
  comment: FileComment;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="group/comment rounded-lg border border-zinc-800/70 bg-zinc-900/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <CommentAuthor comment={comment} />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-zinc-500">
            {formatTimestamp(comment.createdAt)}
          </span>
          {canDelete && (
            <button
              onClick={onDelete}
              className="text-zinc-600 hover:text-red-400 opacity-0 group-hover/comment:opacity-100 transition-opacity p-0.5"
              title="Delete comment"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300">
        {comment.body}
      </p>
    </div>
  );
}

function ThreadCard({
  thread,
  canComment,
}: {
  thread: CommentThread;
  canComment: boolean;
}) {
  const { currentUserId, addComment, deleteComment, setResolved } = useComments();
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);

  const root = thread.comments[0];
  const canDeleteThread = canComment && root.userId === currentUserId;

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = replyText.trim();
    if (!text || !canComment) return;

    try {
      await addComment(thread.target, text, root.id);
      setReplyText('');
      setShowReply(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add reply');
    }
  };

  const handleResolve = async () => {
    try {
      await setResolved(root.id, !thread.resolved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update thread');
    }
  };

  const handleDeleteThread = async () => {
    try {
      await deleteComment(root.id);
      toast.success('Thread deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete thread');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteComment(commentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete comment');
    }
  };

  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        thread.resolved
          ? 'border-zinc-800/60 bg-zinc-950/40 opacity-75'
          : 'border-zinc-800 bg-zinc-950/70'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {thread.resolved && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-900/60 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 flex-shrink-0">
              <Check className="h-2.5 w-2.5" /> Resolved
            </span>
          )}
          <span className="text-[10px] text-zinc-500 truncate">
            {thread.comments.length}{' '}
            {thread.comments.length === 1 ? 'comment' : 'comments'}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {canComment && (
            <button
              onClick={handleResolve}
              className="rounded-md p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              title={thread.resolved ? 'Reopen thread' : 'Resolve thread'}
            >
              {thread.resolved ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {canDeleteThread && (
            <button
              onClick={handleDeleteThread}
              className="rounded-md p-1 text-zinc-500 hover:text-red-400 hover:bg-red-950/40"
              title="Delete thread"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {thread.comments.map((comment) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            canDelete={canComment && comment.userId === currentUserId}
            onDelete={() => handleDeleteComment(comment.id)}
          />
        ))}
      </div>

      {canComment && !thread.resolved && (
        <div>
          {showReply ? (
            <form onSubmit={handleReply} className="space-y-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                rows={2}
                autoFocus
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-700"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowReply(false);
                    setReplyText('');
                  }}
                  className="px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <Button type="submit" size="sm" disabled={!replyText.trim()} className="h-7 text-[11px]">
                  Reply
                </Button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowReply(true)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
            >
              <CornerDownRight className="h-3 w-3" /> Reply
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({ readOnly, canComment }: CommentsPanelProps) {
  const {
    activeTarget,
    activeThreads,
    closeComments,
    isLoading,
    error,
    addComment,
  } = useComments();
  const [draft, setDraft] = useState('');

  const targetLabel = useMemo(() => {
    if (!activeTarget) return '';
    return activeTarget.column
      ? `${activeTarget.table}.${activeTarget.column}`
      : activeTarget.table;
  }, [activeTarget]);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTarget || !canComment) return;
    const text = draft.trim();
    if (!text) return;

    try {
      await addComment(commentTargetKey(activeTarget), text);
      setDraft('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add comment');
    }
  };

  if (!activeTarget) return null;

  const commentsEnabled = canComment && !readOnly;

  return (
    <aside className="absolute right-3 top-16 bottom-3 z-30 flex w-[min(340px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur-md">
      <header className="flex items-start justify-between gap-2 border-b border-zinc-800 px-3.5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
            <MessageSquare className="h-4 w-4 text-indigo-400" />
            Comments
            {!commentsEnabled && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                <Eye className="h-2.5 w-2.5" />
                Read only
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-400">{targetLabel}</p>
        </div>
        <button
          onClick={closeComments}
          className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title="Close comments"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading && activeThreads.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">Loading comments...</div>
        ) : error ? (
          <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-300">
            {error.message}
          </div>
        ) : activeThreads.length === 0 ? (
          <div className="py-10 text-center">
            <MessageSquare className="mx-auto mb-2 h-7 w-7 text-zinc-700" />
            <p className="text-xs text-zinc-500">No comments yet.</p>
            <p className="mt-1 text-[11px] text-zinc-600">
              {commentsEnabled
                ? `Start a discussion about this ${activeTarget.column ? 'column' : 'table'}.`
                : 'Comments shared by editors will appear here.'}
            </p>
          </div>
        ) : (
          activeThreads.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              canComment={commentsEnabled}
            />
          ))
        )}
      </div>

      {commentsEnabled ? (
        <form onSubmit={handleCreateThread} className="border-t border-zinc-800 p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Comment on ${targetLabel}...`}
            rows={2}
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-700"
          />
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" disabled={!draft.trim()} className="h-7 text-[11px]">
              Comment
            </Button>
          </div>
        </form>
      ) : (
        <div className="border-t border-zinc-800 p-3 text-center text-[11px] text-zinc-500">
          You can read comments, but your role cannot post or resolve them.
        </div>
      )}
    </aside>
  );
}
