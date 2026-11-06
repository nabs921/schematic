export const DEFAULT_COLLAB_PORT = 1234;

/**
 * URL of the self-hosted Yjs WebSocket server.
 *
 * Set `NEXT_PUBLIC_COLLAB_WS_URL` (for example `ws://192.168.1.20:1234`) when
 * the app and the collaboration server are on different hosts. Otherwise the
 * browser connects to port 1234 on whatever host served the app.
 */
export function getCollabServerUrl(): string {
  const configured = process.env.NEXT_PUBLIC_COLLAB_WS_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  if (typeof window === 'undefined') {
    return `ws://localhost:${DEFAULT_COLLAB_PORT}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}://${hostname}:${DEFAULT_COLLAB_PORT}`;
}

/** One collaboration room per schema file. */
export function getCollabRoomName(fileId: string): string {
  return `schematic-schema-${fileId}`;
}

/**
 * HTTP origin of the collaboration server's control endpoints, used by server
 * actions to revoke or restore a collaborator's access immediately.
 *
 * `COLLAB_CONTROL_URL` wins when it is set. Otherwise we derive it from the
 * public WebSocket URL or fall back to loopback port 1234.
 */
export function getCollabControlUrl(): string {
  const configured = process.env.COLLAB_CONTROL_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const wsUrl = process.env.NEXT_PUBLIC_COLLAB_WS_URL?.trim();
  if (wsUrl) {
    return wsUrl
      .replace(/\/+$/, '')
      .replace(/^ws:/i, 'http:')
      .replace(/^wss:/i, 'https:');
  }

  const port = process.env.COLLAB_PORT?.trim() || String(DEFAULT_COLLAB_PORT);
  return `http://127.0.0.1:${port}`;
}
