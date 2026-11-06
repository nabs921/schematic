export interface CollaboratorCursor {
  x: number;
  y: number;
}

export interface CollaboratorInfo {
  id?: string;
  name?: string;
  email?: string;
  color?: string;
  role?: string;
}

export interface CollaboratorPresence {
  id?: string;
  name?: string;
  email?: string;
  color?: string;
  role?: string;
  activity?: string;
  /** Canvas pointer position in React Flow coordinates. */
  cursor?: CollaboratorCursor | null;
}

export interface CollaboratorUser {
  clientId: number;
  id?: string;
  info?: CollaboratorInfo | null;
  presence?: CollaboratorPresence | null;
}

/** Shape of the local awareness state written by schema-workspace. */
export interface CollaborationAwarenessState {
  user?: CollaboratorInfo | null;
  activity?: string;
  /**
   * Canvas pointer. Kept separate from `cursor`, which is managed by
   * y-codemirror for text selections.
   */
  canvasCursor?: CollaboratorCursor | null;
}

interface AwarenessLike {
  readonly clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
}

/**
 * Maps Yjs awareness states to the UI shape used by the canvas/avatars,
 * excluding this client's own state.
 */
export function getRemoteCollaborators(
  awareness: AwarenessLike | null | undefined
): CollaboratorUser[] {
  if (!awareness) return [];

  const collaborators: CollaboratorUser[] = [];

  awareness.getStates().forEach((rawState, clientId) => {
    if (clientId === awareness.clientID) return;

    const state = rawState as CollaborationAwarenessState;
    const info = state.user ?? null;

    collaborators.push({
      clientId,
      id: info?.id ?? (info?.email ? `${info.email}-${clientId}` : String(clientId)),
      info,
      presence: {
        id: info?.id,
        name: info?.name,
        email: info?.email,
        color: info?.color,
        role: info?.role,
        activity: state.activity || 'Viewing schema',
        cursor: state.canvasCursor ?? null,
      },
    });
  });

  return collaborators;
}
