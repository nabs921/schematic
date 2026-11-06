'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { SafeUser } from '@/lib/db/queries/users';
import { DiagramFile } from '@/lib/db/queries/files';
import type { FileCommentRow } from '@/lib/db/queries/comments';
import { MemberInfo, UserRole } from '@/lib/db/queries/permissions';
import { parseSqlSchema, ParsedSchema, SqlParseError } from '@/lib/sql/parser';
import { SqlCodeMirror } from './sql-codemirror';
import { ImportDialog } from './import-dialog';
import { ErCanvas, CanvasNote } from '../diagram/er-canvas';
import { ShareDialog } from '../collaboration/share-dialog';
import { CollaboratorAvatars, Collaborator } from '../collaboration/collaborator-avatars';
import { getRemoteCollaborators, type CollaboratorUser } from '../collaboration/types';
import { CommentsProvider } from '../comments/comments-context';
import { CommentsPanel } from '../comments/comments-panel';
import { getCollabRoomName, getCollabServerUrl } from '@/lib/collab/config';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {
  exportDbmlFromSql,
  exportDrizzle,
  exportMermaid,
  exportPrisma,
  exportProjectJson,
} from '@/lib/sql/exporters';
import { toPng, toSvg } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Database,
  ArrowLeft,
  Share2,
  Download,
  Cloud,
  CloudOff,
  Edit2,
  FileCode,
  FileJson,
  Braces,
  Workflow,
  Image as ImageIcon,
  Upload,
} from 'lucide-react';
import { saveFileStateAction, renameFileAction, checkFileAccessAction } from '@/lib/workspace/actions';

interface SchemaWorkspaceProps {
  user: SafeUser;
  file: DiagramFile;
  role: UserRole;
  members: MemberInfo[];
  folderBreadcrumbs: { id: string; name: string }[];
  comments: FileCommentRow[];
}

interface WorkspaceDraft {
  sql: string;
  notes: CanvasNote[];
  positions: Record<string, { x: number; y: number }>;
  savedAt: number;
}

interface CollabSession {
  doc: Y.Doc;
  provider: WebsocketProvider;
  ytext: Y.Text;
  positionsMap: Y.Map<{ x: number; y: number }>;
  notesMap: Y.Map<CanvasNote>;
  metaMap: Y.Map<boolean>;
  commentsMap: Y.Map<number>;
}

function notesEqual(a: CanvasNote, b: CanvasNote): boolean {
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.color === b.color &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y
  );
}

const DRAFT_PREFIX = 'schematic:draft:';

/**
 * Edits are mirrored into localStorage so a failed/unavailable PostgreSQL
 * connection never loses work. The draft is cleared after a successful save.
 */
function draftKey(fileId: string): string {
  return `${DRAFT_PREFIX}${fileId}`;
}

function readDraft(fileId: string): WorkspaceDraft | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(draftKey(fileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceDraft;
    if (typeof parsed.sql !== 'string' || !Array.isArray(parsed.notes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(fileId: string, draft: WorkspaceDraft) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(draftKey(fileId), JSON.stringify(draft));
  } catch {
    // Quota exceeded or storage disabled: the in-memory state still works.
  }
}

function clearDraft(fileId: string) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(draftKey(fileId));
  } catch {
    // Ignore storage access errors.
  }
}

export function SchemaWorkspace(props: SchemaWorkspaceProps) {
  return <WorkspaceInner {...props} />;
}

function WorkspaceInner({
  user,
  file,
  role,
  members,
  comments,
}: SchemaWorkspaceProps) {
  const isReadOnly = role === 'viewer';
  const canManage = role === 'owner' || role === 'editor';

  // State
  const [fileName, setFileName] = useState(file.name);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(file.name);

  const [sqlContent, setSqlContent] = useState(file.sql_content);
  // The editor is seeded once. Restoring a local draft replaces this value so
  // CodeMirror recreates itself with the recovered SQL, while normal typing
  // only updates `sqlContent` and never re-creates the editor.
  const [editorSeed, setEditorSeed] = useState(file.sql_content);

  // Parse SQL during render instead of in an effect. When the SQL is invalid we
  // keep showing the last successfully parsed schema in the diagram.
  const parseResult = useMemo(() => parseSqlSchema(sqlContent), [sqlContent]);
  const [lastValidParsedSchema, setLastValidParsedSchema] = useState<ParsedSchema | null>(null);
  if (
    parseResult.success &&
    parseResult.schema &&
    parseResult.schema !== lastValidParsedSchema
  ) {
    setLastValidParsedSchema(parseResult.schema);
  }
  const parsedSchema =
    parseResult.success && parseResult.schema ? parseResult.schema : lastValidParsedSchema;
  const parseErrors: SqlParseError[] = parseResult.success ? [] : parseResult.errors;

  const [notes, setNotes] = useState<CanvasNote[]>(file.canvas_data?.notes || []);
  const [tablePositions, setTablePositions] = useState<Record<string, { x: number; y: number }>>(
    (file.canvas_data?.positions as Record<string, { x: number; y: number }>) || {}
  );

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [isOnline, setIsOnline] = useState(true);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Local Yjs collaboration session and presence state.
  const [collab, setCollab] = useState<CollabSession | null>(null);
  const [isYjsReady, setIsYjsReady] = useState(false);
  const [collabStatus, setCollabStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting'
  );
  const [collaboratorOthers, setCollaboratorOthers] = useState<readonly CollaboratorUser[]>([]);
  const [commentsVersion, setCommentsVersion] = useState(0);

  // Refs let callbacks read the latest values without being recreated on
  // every keystroke/drag.
  const sqlContentRef = useRef(sqlContent);
  const notesRef = useRef(notes);
  const positionsRef = useRef(tablePositions);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  // Create the self-hosted Yjs session for this schema file. The provider
  // reconnects automatically, so the workspace keeps working (and autosaving)
  // when the collaboration server is temporarily unavailable.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const doc = new Y.Doc();
    const provider = new WebsocketProvider(
      getCollabServerUrl(),
      getCollabRoomName(file.id),
      doc,
      {
        connect: true,
        // The collaboration server uses this to close the right sockets when
        // an owner removes this user, and to reject reconnects until access is
        // restored or the revocation expires.
        params: { userId: user.id },
      }
    );

    provider.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      email: user.email,
      color: user.avatar_color,
      role,
    });
    provider.awareness.setLocalStateField('activity', 'Viewing schema');
    provider.awareness.setLocalStateField('canvasCursor', null);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- the Yjs session can only be created after mount
    setCollab({
      doc,
      provider,
      ytext: doc.getText('codemirror'),
      positionsMap: doc.getMap<{ x: number; y: number }>('positions'),
      notesMap: doc.getMap<CanvasNote>('notes'),
      metaMap: doc.getMap<boolean>('meta'),
      commentsMap: doc.getMap<number>('comments'),
    });

    const handleStatus = (event: {
      status: 'connected' | 'disconnected' | 'connecting';
    }) => {
      setCollabStatus(event.status);
    };

    // The collaboration server closes revoked sessions with code 4001. Stop
    // the provider before redirecting so its reconnect loop cannot keep the
    // removed user connected in the background.
    let disposed = false;
    let lastAccessCheckAt = 0;

    const leaveRevokedSession = () => {
      if (disposed) return;
      disposed = true;
      provider.destroy();
      window.location.replace('/dashboard?error=access_denied');
    };

    const handleConnectionClose = (event: CloseEvent | null) => {
      if (event?.code === 4001) {
        leaveRevokedSession();
        return;
      }

      // A refused upgrade (403) surfaces as an abnormal close. Verify against
      // the database so revocation also takes effect for tabs that were
      // offline when the owner sent the kick. Debounced because y-websocket
      // retries with exponential backoff.
      if (disposed) return;
      const now = Date.now();
      if (now - lastAccessCheckAt < 15000) return;
      lastAccessCheckAt = now;

      void checkFileAccessAction(file.id)
        .then((access) => {
          if (!access.hasAccess) leaveRevokedSession();
        })
        .catch(() => {
          // Server temporarily unavailable; retry on the next close.
        });
    };

    const handleSync = (synced: boolean) => {
      if (synced) setCollabStatus('connected');
    };
    const handleAwareness = (changes?: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      // Local awareness updates (text cursor, activity, ...) should not
      // re-render the workspace. Only refresh the collaborator list when a
      // remote client changed.
      if (changes) {
        const changedIds = [...changes.added, ...changes.updated, ...changes.removed];
        if (!changedIds.some((id) => id !== provider.awareness.clientID)) return;
      }
      setCollaboratorOthers(getRemoteCollaborators(provider.awareness));
    };

    provider.on('status', handleStatus);
    provider.on('sync', handleSync);
    provider.on('connection-close', handleConnectionClose);
    provider.awareness.on('change', handleAwareness);
    handleAwareness();

    return () => {
      disposed = true;
      provider.off('status', handleStatus);
      provider.off('sync', handleSync);
      provider.off('connection-close', handleConnectionClose);
      provider.awareness.off('change', handleAwareness);
      provider.destroy();
      doc.destroy();
      setCollab(null);
      setIsYjsReady(false);
      setCollaboratorOthers([]);
    };
  }, [file.id, user.id, user.name, user.email, user.avatar_color, role]);

  // Auto-save debounced to the local PostgreSQL database. Every edit is also
  // written to localStorage immediately so it survives an offline session.
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerAutoSave = useCallback(
    (
      newSql: string,
      newNotes: CanvasNote[],
      newPositions: Record<string, { x: number; y: number }>
    ) => {
      if (isReadOnly) return;

      writeDraft(file.id, {
        sql: newSql,
        notes: newNotes,
        positions: newPositions,
        savedAt: Date.now(),
      });
      setSaveStatus('saving');

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveFileStateAction(file.id, newSql, {
            notes: newNotes,
            positions: newPositions,
          });
          clearDraft(file.id);
          setSaveStatus('saved');
        } catch (err) {
          console.error('Failed to auto-save:', err);
          setSaveStatus('unsaved');
        }
      }, 1000);
    },
    [file.id, isReadOnly]
  );

  // Track connectivity and retry the pending draft as soon as we are online.
  useEffect(() => {
    const updateStatus = () => setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      triggerAutoSave(sqlContentRef.current, notesRef.current, positionsRef.current);
    };

    updateStatus();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', updateStatus);
    };
  }, [triggerAutoSave]);

  useEffect(() => {
    if (isReadOnly || !isOnline || saveStatus !== 'unsaved') return;

    const retry = setInterval(async () => {
      try {
        await saveFileStateAction(file.id, sqlContentRef.current, {
          notes: notesRef.current,
          positions: positionsRef.current,
        });
        clearDraft(file.id);
        setSaveStatus('saved');
      } catch {
        // Still unavailable; keep the local draft and try again later.
      }
    }, 10_000);

    return () => clearInterval(retry);
  }, [file.id, isOnline, isReadOnly, saveStatus]);

  // A local draft left behind by an offline/failed save is restored after
  // hydration and immediately queued for saving to PostgreSQL.
  const didRestoreDraftRef = useRef(false);
  useEffect(() => {
    if (isReadOnly || didRestoreDraftRef.current) return;
    didRestoreDraftRef.current = true;

    const draft = readDraft(file.id);
    if (!draft) return;

    const serverUpdatedAt = new Date(file.updated_at).getTime();
    if (Number.isFinite(serverUpdatedAt) && draft.savedAt <= serverUpdatedAt) {
      clearDraft(file.id);
      return;
    }

    sqlContentRef.current = draft.sql;
    notesRef.current = draft.notes;
    positionsRef.current = draft.positions;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time recovery of a local draft after hydration
    setSqlContent(draft.sql);
    setEditorSeed(draft.sql);
    setNotes(draft.notes);
    setTablePositions(draft.positions);
    setSaveStatus('unsaved');

    triggerAutoSave(draft.sql, draft.notes, draft.positions);
  }, [file.id, file.updated_at, isReadOnly, triggerAutoSave]);

  // Seed the shared document from PostgreSQL/local data once, then keep React
  // state in sync with every remote (or local) Yjs update.
  useEffect(() => {
    if (!collab) return;

    const { doc, provider, ytext, positionsMap, notesMap, metaMap, commentsMap } = collab;
    let cancelled = false;
    let started = false;

    const syncText = () => {
      const current = ytext.toString();
      sqlContentRef.current = current;
      setSqlContent(current);
    };
    const syncPositions = () => {
      const current = positionsMap.toJSON();
      positionsRef.current = current;
      setTablePositions(current);
    };
    const syncNotes = () => {
      const current = Object.values(notesMap.toJSON()) as CanvasNote[];
      notesRef.current = current;
      setNotes(current);
    };
    const syncCommentsVersion = () => {
      setCommentsVersion(commentsMap.get('version') ?? 0);
    };
    const handleCommentsChange = (
      _event: Y.YMapEvent<number>,
      transaction: Y.Transaction
    ) => {
      // Local comment mutations already refetched; only remote changes need
      // to pull the comments again.
      if (transaction.origin === 'comments-local') return;
      syncCommentsVersion();
    };

    const start = () => {
      if (started || cancelled) return;
      started = true;

      // `meta.seeded` is stored in Yjs itself, so an intentionally empty
      // schema is never re-seeded from an older database snapshot.
      if (metaMap.get('seeded') !== true) {
        doc.transact(() => {
          if (ytext.length === 0) {
            const seedSql = sqlContentRef.current || file.sql_content;
            if (seedSql) ytext.insert(0, seedSql);
          }

          if (positionsMap.size === 0) {
            Object.entries(positionsRef.current).forEach(([id, position]) => {
              positionsMap.set(id, position);
            });
          }

          if (notesMap.size === 0 && notesRef.current.length > 0) {
            notesRef.current.forEach((note) => notesMap.set(note.id, note));
          }

          metaMap.set('seeded', true);
        });
      }

      ytext.observe(syncText);
      positionsMap.observe(syncPositions);
      notesMap.observe(syncNotes);
      commentsMap.observe(handleCommentsChange);

      syncText();
      syncPositions();
      syncNotes();
      syncCommentsVersion();
      setIsYjsReady(true);
    };

    const handleSync = (synced: boolean) => {
      if (synced) start();
    };

    if (provider.synced) {
      start();
    } else {
      provider.on('sync', handleSync);
    }

    // If the collaboration server is not running, fall back to the local
    // document so the editor and canvas remain usable offline. Autosave still
    // persists everything to PostgreSQL.
    const fallback = setTimeout(start, 2500);

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      provider.off('sync', handleSync);
      ytext.unobserve(syncText);
      positionsMap.unobserve(syncPositions);
      notesMap.unobserve(syncNotes);
      commentsMap.unobserve(handleCommentsChange);
    };
  }, [collab, file.id, file.sql_content]);

  // Remove Yjs positions for tables that no longer exist in the schema.
  useEffect(() => {
    if (!collab || !parsedSchema) return;

    const validTableIds = new Set(parsedSchema.tables.map((table) => table.name));
    const staleIds = Array.from(collab.positionsMap.keys()).filter(
      (id) => !validTableIds.has(id)
    );
    if (staleIds.length === 0) return;

    collab.doc.transact(() => {
      staleIds.forEach((id) => collab.positionsMap.delete(id));
    });
  }, [collab, parsedSchema]);

  // Handle SQL changes from CodeMirror
  const handleSqlChange = useCallback(
    (newVal: string) => {
      sqlContentRef.current = newVal;
      setSqlContent(newVal);
      triggerAutoSave(newVal, notesRef.current, positionsRef.current);
    },
    [triggerAutoSave]
  );

  // Handle sticky note changes
  const handleNotesChange = useCallback(
    (newNotes: CanvasNote[]) => {
      if (isReadOnly) return;

      const previousById = new Map(notesRef.current.map((n) => [n.id, n]));
      const nextById = new Map(newNotes.map((n) => [n.id, n]));

      // Only write notes that actually changed locally, so a concurrent edit
      // to a different note is not clobbered by this client's stale snapshot.
      if (collab) {
        collab.doc.transact(() => {
          nextById.forEach((note, id) => {
            const previous = previousById.get(id);
            if (!previous || !notesEqual(previous, note)) {
              collab.notesMap.set(id, note);
            }
          });
          previousById.forEach((_, id) => {
            if (!nextById.has(id)) {
              collab.notesMap.delete(id);
            }
          });
        });
      }

      notesRef.current = newNotes;
      setNotes(newNotes);
      triggerAutoSave(sqlContentRef.current, newNotes, positionsRef.current);
    },
    [collab, isReadOnly, triggerAutoSave]
  );

  // Handle table position changes
  const handlePositionsChange = useCallback(
    (newPositions: Record<string, { x: number; y: number }>) => {
      if (isReadOnly) return;

      const previousPositions = positionsRef.current;
      const changedEntries = Object.entries(newPositions).filter(([id, position]) => {
        const previous = previousPositions[id];
        return !previous || previous.x !== position.x || previous.y !== position.y;
      });
      const clearAll = Object.keys(newPositions).length === 0;

      if (collab) {
        collab.doc.transact(() => {
          if (clearAll) {
            // Auto Layout intentionally discards every manual position so the
            // canvas falls back to the ELK layout.
            Array.from(collab.positionsMap.keys()).forEach((id) =>
              collab.positionsMap.delete(id)
            );
          } else {
            changedEntries.forEach(([id, position]) => collab.positionsMap.set(id, position));
          }
        });
      }

      positionsRef.current = newPositions;
      setTablePositions(newPositions);
      triggerAutoSave(sqlContentRef.current, notesRef.current, newPositions);
    },
    [collab, isReadOnly, triggerAutoSave]
  );

  // Handle Title Rename
  const handleTitleSubmit = async () => {
    setIsEditingTitle(false);
    if (!titleInput.trim() || titleInput === fileName) return;
    try {
      await renameFileAction(file.id, titleInput.trim());
      setFileName(titleInput.trim());
    } catch {
      toast.error('Failed to rename schema');
      setTitleInput(fileName);
    }
  };

  // Presence & activity updates over Yjs awareness.
  const handleActivityChange = useCallback(
    (activity: string) => {
      const provider = collab?.provider;
      if (!provider) return;

      // Reset the idle timer on every activity signal, even if we skip the
      // awareness write below for throttling.
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;

      const isTransient = activity !== 'Viewing schema' && activity !== 'Idle';
      if (isTransient) {
        activityTimerRef.current = setTimeout(() => {
          lastActivityRef.current = { value: 'Viewing schema', at: Date.now() };
          provider.awareness.setLocalStateField('activity', 'Viewing schema');
        }, 4000);
      }

      const now = Date.now();
      const last = lastActivityRef.current;

      // Don't flood the awareness channel on every keystroke/drag event.
      if (activity === last.value && now - last.at < 2000) return;
      if (now - last.at < 250) return;
      lastActivityRef.current = { value: activity, at: now };

      provider.awareness.setLocalStateField('user', {
        name: user.name,
        email: user.email,
        color: user.avatar_color,
        role,
      });
      provider.awareness.setLocalStateField('activity', activity);
    },
    [collab, user.name, user.avatar_color, user.email, role]
  );

  useEffect(() => {
    return () => {
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, []);

  const handleCursorMove = useCallback(
    (cursor: { x: number; y: number } | null) => {
      // Canvas cursors use a dedicated awareness field so y-codemirror can keep
      // using `cursor` for text selections.
      collab?.provider.awareness.setLocalStateField('canvasCursor', cursor);
    },
    [collab]
  );

  // Broadcast a comment change to every connected client. They will refetch
  // the authoritative rows from PostgreSQL.
  const handleCommentsChanged = useCallback(() => {
    if (!collab) return;

    collab.doc.transact(() => {
      const current = collab.commentsMap.get('version') ?? 0;
      collab.commentsMap.set('version', current + 1);
    }, 'comments-local');
  }, [collab]);

  // Collaborators mapped from Yjs awareness, including the current user.
  const activeCollaborators: Collaborator[] = useMemo(() => {
    const list: Collaborator[] = [
      {
        id: user.id,
        name: user.name,
        email: user.email,
        color: user.avatar_color,
        role,
        isSelf: true,
        activity: 'Active (You)',
      },
    ];

    collaboratorOthers.forEach((other) => {
      const info = other.info || {};
      const presence = other.presence || {};

      list.push({
        id: other.id || String(other.clientId),
        name: info.name || presence.name || 'Collaborator',
        email: info.email || presence.email || '',
        color: info.color || presence.color || '#6366f1',
        role: info.role || presence.role || 'viewer',
        isSelf: false,
        activity: presence.activity || 'Viewing schema',
      });
    });

    return list;
  }, [collaboratorOthers, user, role]);

  // Identify any collaborator actively editing right now.
  const activeEditingCollaborator = useMemo(() => {
    return activeCollaborators.find(
      (collaborator) =>
        !collaborator.isSelf &&
        Boolean(collaborator.activity) &&
        collaborator.activity !== 'Viewing schema' &&
        collaborator.activity !== 'Idle'
    );
  }, [activeCollaborators]);

  // Keyboard shortcut for manual save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!isReadOnly) {
          setSaveStatus('saving');
          saveFileStateAction(file.id, sqlContentRef.current, {
            notes: notesRef.current,
            positions: positionsRef.current,
          })
            .then(() => {
              clearDraft(file.id);
              setSaveStatus('saved');
            })
            .catch(() => setSaveStatus('unsaved'));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file.id, isReadOnly]);

  const fileSlug = fileName.replace(/\s+/g, '_').toLowerCase();

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSql = useCallback(
    (nextSql: string) => {
      if (isReadOnly) {
        toast.error('You do not have permission to import into this schema.');
        return;
      }
      if (!isYjsReady || !collab) {
        toast.error('Wait for the collaboration session to finish syncing before importing.');
        return;
      }

      // Y.Text is the collaborative source of truth, so an import replaces it
      // inside a Yjs transaction instead of only changing local state.
      collab.doc.transact(() => {
        collab.ytext.delete(0, collab.ytext.length);
        collab.ytext.insert(0, nextSql);
      }, 'import-schema');

      sqlContentRef.current = nextSql;
      setSqlContent(nextSql);
      triggerAutoSave(nextSql, notesRef.current, positionsRef.current);
    },
    [collab, isReadOnly, isYjsReady, triggerAutoSave]
  );

  const handleExportFormat = async (
    format: 'sql' | 'dbml' | 'mermaid' | 'prisma' | 'drizzle' | 'json' | 'png' | 'svg'
  ) => {
    const textFormats = new Set(['dbml', 'mermaid', 'prisma', 'drizzle', 'json']);
    if (textFormats.has(format) && (!parsedSchema || parseErrors.length > 0)) {
      toast.error('Fix SQL syntax errors before exporting this format.');
      return;
    }

    try {
      switch (format) {
        case 'sql':
          downloadFile(`${fileSlug}.sql`, sqlContent, 'text/plain;charset=utf-8');
          break;
        case 'dbml':
          downloadFile(`${fileSlug}.dbml`, exportDbmlFromSql(sqlContent), 'text/plain;charset=utf-8');
          break;
        case 'mermaid':
          if (!parsedSchema) return;
          downloadFile(`${fileSlug}.mmd`, exportMermaid(parsedSchema), 'text/plain;charset=utf-8');
          break;
        case 'prisma':
          if (!parsedSchema) return;
          downloadFile(`${fileSlug}.prisma`, exportPrisma(parsedSchema), 'text/plain;charset=utf-8');
          break;
        case 'drizzle':
          if (!parsedSchema) return;
          downloadFile(`${fileSlug}.ts`, exportDrizzle(parsedSchema), 'text/plain;charset=utf-8');
          break;
        case 'json':
          if (!parsedSchema) return;
          downloadFile(
            `${fileSlug}.json`,
            exportProjectJson({
              name: fileName,
              sql: sqlContent,
              schema: parsedSchema,
              notes,
            }),
            'application/json'
          );
          break;
        case 'png':
        case 'svg': {
          const flowElement = document.querySelector('.react-flow__viewport') as HTMLElement | null;
          if (!flowElement) throw new Error('Canvas is not ready yet.');

          const dataUrl =
            format === 'png'
              ? await toPng(flowElement, {
                  backgroundColor: '#070b14',
                  quality: 1,
                  pixelRatio: 2,
                })
              : await toSvg(flowElement, { backgroundColor: '#070b14' });

          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `${fileSlug}-diagram.${format}`;
          a.click();
          break;
        }
      }

      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error(err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}`);
    }
  };

  const tableCount = parsedSchema?.tables.length || 0;
  const relationshipCount = parsedSchema?.relationships.length || 0;

  return (
    <CommentsProvider
      fileId={file.id}
      currentUserId={user.id}
      initialComments={comments}
      realtimeVersion={collab ? commentsVersion : undefined}
      onCommentsChanged={handleCommentsChanged}
    >
      <div className="h-screen w-screen flex flex-col bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans">
      {/* Top Workspace Header Navigation */}
      <header className="h-14 border-b border-zinc-800/80 px-4 flex items-center justify-between gap-3 bg-[#0a0a0a]/90 backdrop-blur-md flex-shrink-0 z-30">
        {/* Left: Back & Breadcrumbs & Editable Title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900/60 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex items-center gap-2 overflow-hidden">
            <div className="h-7 w-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 flex-shrink-0">
              <Database className="h-3.5 w-3.5" />
            </div>

            {isEditingTitle && !isReadOnly ? (
              <input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                autoFocus
                className="bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-sm font-semibold text-white outline-none w-48"
              />
            ) : (
              <div
                onClick={() => !isReadOnly && setIsEditingTitle(true)}
                className={`flex items-center gap-1.5 truncate group ${
                  !isReadOnly ? 'cursor-pointer' : ''
                }`}
              >
                <span className="font-semibold text-sm text-zinc-100 truncate group-hover:text-zinc-200 transition-colors">
                  {fileName}
                </span>
                {!isReadOnly && (
                  <Edit2 className="h-3 w-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                )}
              </div>
            )}

            <Badge
              variant={role === 'owner' ? 'default' : 'secondary'}
              className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2"
            >
              {role}
            </Badge>
          </div>
        </div>

        {/* Center: Live Activity & Save / Connection Status */}
        <div className="hidden md:flex items-center gap-3">
          {activeEditingCollaborator && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/95 border border-zinc-700 text-xs shadow-md animate-in fade-in duration-200">
              <span
                className="h-2 w-2 rounded-full animate-ping"
                style={{ backgroundColor: activeEditingCollaborator.color }}
              />
              <span className="font-semibold text-zinc-200">
                {activeEditingCollaborator.name}:
              </span>
              <span className="text-zinc-400 font-mono text-[11px]">
                {activeEditingCollaborator.activity}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            {!isOnline ? (
              <span className="flex items-center gap-1 text-amber-400">
                <CloudOff className="h-3.5 w-3.5" />
                Offline — edits saved locally
              </span>
            ) : !isYjsReady ? (
              <span className="flex items-center gap-1 text-zinc-500">
                <span className="h-2 w-2 rounded-full bg-zinc-500 animate-pulse" />
                Syncing collaboration...
              </span>
            ) : collabStatus === 'disconnected' ? (
              <span className="flex items-center gap-1 text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                Collaboration offline — still saving
              </span>
            ) : saveStatus === 'saving' ? (
              <span className="flex items-center gap-1 text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-zinc-400 animate-ping" />
                Saving...
              </span>
            ) : saveStatus === 'saved' ? (
              <span className="flex items-center gap-1 text-zinc-500">
                <Cloud className="h-3.5 w-3.5 text-zinc-400" />
                Saved
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-300">
                <CloudOff className="h-3.5 w-3.5" />
                Unsaved — kept locally
              </span>
            )}
          </div>
        </div>

        {/* Right: Collaborators, Share & Export */}
        <div className="flex items-center gap-2">
          <CollaboratorAvatars collaborators={activeCollaborators} />

          {/* Share Button */}
          <Button
            onClick={() => setIsShareOpen(true)}
            size="sm"
            className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs h-8 px-3 rounded-lg flex items-center gap-1.5"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>

          {/* Import */}
          <Button
            onClick={() => setIsImportOpen(true)}
            disabled={isReadOnly || !isYjsReady}
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs text-zinc-300 hover:text-white border-zinc-800 bg-zinc-900/60"
            title="Import SQL, DBML, or JSON"
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">Import</span>
          </Button>

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs text-zinc-300 hover:text-white border-zinc-800 bg-zinc-900/60"
                title="Export Schema"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">Schema</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleExportFormat('sql')}>
                <FileCode className="h-3.5 w-3.5 mr-2 text-zinc-400" /> PostgreSQL SQL (.sql)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportFormat('dbml')}>
                <Braces className="h-3.5 w-3.5 mr-2 text-zinc-400" /> DBML (.dbml)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportFormat('mermaid')}>
                <Workflow className="h-3.5 w-3.5 mr-2 text-zinc-400" /> Mermaid ER (.mmd)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportFormat('prisma')}>
                <Database className="h-3.5 w-3.5 mr-2 text-zinc-400" /> Prisma (.prisma)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportFormat('drizzle')}>
                <FileCode className="h-3.5 w-3.5 mr-2 text-zinc-400" /> Drizzle (.ts)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportFormat('json')}>
                <FileJson className="h-3.5 w-3.5 mr-2 text-zinc-400" /> Project JSON (.json)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Diagram</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void handleExportFormat('png')}>
                <ImageIcon className="h-3.5 w-3.5 mr-2 text-zinc-400" /> PNG image (.png)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportFormat('svg')}>
                <ImageIcon className="h-3.5 w-3.5 mr-2 text-zinc-400" /> SVG image (.svg)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Resizable Split View */}
      <div className="flex-1 overflow-hidden relative">
        <PanelGroup orientation="horizontal">
          {/* Left Panel: CodeMirror SQL Editor */}
          <Panel defaultSize={40} minSize={22} className="h-full">
            <SqlCodeMirror
              initialValue={editorSeed}
              onChange={handleSqlChange}
              errors={parseErrors}
              tableCount={tableCount}
              relationshipCount={relationshipCount}
              readOnly={isReadOnly || !isYjsReady}
              isConnecting={!isYjsReady}
              ytext={isYjsReady ? collab?.ytext ?? null : null}
              awareness={isYjsReady ? collab?.provider.awareness ?? null : null}
              onActivityChange={handleActivityChange}
              activeCollaborator={activeEditingCollaborator || null}
            />
          </Panel>

          {/* Resizable Splitter Handle */}
          <PanelResizeHandle className="w-1.5 bg-zinc-900 hover:bg-zinc-700 transition-colors flex items-center justify-center cursor-col-resize group z-10">
            <div className="h-8 w-1 rounded-full bg-zinc-700 group-hover:bg-zinc-500 transition-colors" />
          </PanelResizeHandle>

          {/* Right Panel: Interactive React Flow ER Canvas */}
          <Panel defaultSize={60} minSize={25} className="h-full">
            <div className="relative h-full">
              <ErCanvas
                schema={parsedSchema}
                isInvalidSql={parseErrors.length > 0}
                errorCount={parseErrors.length}
                initialPositions={tablePositions}
                notes={notes}
                onNotesChange={handleNotesChange}
                onPositionsChange={handlePositionsChange}
                readOnly={isReadOnly}
                schemaName={fileName}
                others={collaboratorOthers}
                onActivityChange={handleActivityChange}
                onCursorMove={handleCursorMove}
              />
              <CommentsPanel
                readOnly={isReadOnly}
                canComment={!isReadOnly}
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Import Modal Dialog */}
      <ImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImport={handleImportSql}
      />

      {/* Share Modal Dialog */}
      <ShareDialog
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        resourceType="file"
        resourceId={file.id}
        resourceName={fileName}
        members={members}
        canManage={canManage}
      />
      </div>
    </CommentsProvider>
  );
}
