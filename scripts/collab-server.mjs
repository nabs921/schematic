#!/usr/bin/env node

/**
 * Self-hosted Yjs collaboration server.
 *
 * Clients connect to `ws://<host>:1234/<room>?userId=<id>` and sync through the
 * standard y-websocket protocol. No cloud account, API key, or internet
 * connection is required — run this alongside `next dev` / `next start`.
 *
 * The server also exposes two small control endpoints used by the Next.js app
 * to revoke access immediately:
 *
 *   POST /kick   { "room": "...", "userId": "..." }
 *   POST /allow  { "room": "...", "userId": "..." }
 *
 * Control requests are authenticated with `COLLAB_CONTROL_SECRET` when it is
 * configured. Without a secret, only loopback requests are accepted so local
 * development stays zero-config.
 */

import http from 'node:http';
import { createRequire } from 'node:module';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Load local configuration when present (COLLAB_HOST / COLLAB_PORT). Next.js
// gives `.env.local` priority over `.env`; mirror that behaviour here. Missing
// files are fine: defaults below keep the server zero-config.
for (const file of ['../.env.local', '../.env']) {
  try {
    process.loadEnvFile(fileURLToPath(new URL(file, import.meta.url)));
  } catch {
    // No such file (or the runtime does not support loadEnvFile).
  }
}

const require = createRequire(import.meta.url);
const { WebSocketServer } = require('ws');
const { setupWSConnection, docs } = require('y-websocket/bin/utils');

const host = process.env.COLLAB_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.COLLAB_PORT || '1234', 10);
const controlSecret = (process.env.COLLAB_CONTROL_SECRET || '').trim();
const parsedRevokeTtl = Number.parseInt(process.env.COLLAB_REVOKE_TTL_MS || '', 10);
const revokeTtlMs =
  Number.isFinite(parsedRevokeTtl) && parsedRevokeTtl > 0
    ? parsedRevokeTtl
    : 24 * 60 * 60 * 1000; // 24 hours

if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  console.error(`[collab] Invalid COLLAB_PORT: ${process.env.COLLAB_PORT}`);
  process.exit(1);
}

/** Tracks open sockets so we can close them even before awareness is set. */
const connections = new Set();

/**
 * Rooms + users that must not be allowed to reconnect while their DB access is
 * being re-evaluated. Keyed by `room\u0000userId`; value is an expiry timestamp.
 */
const revoked = new Map();

function revokedKey(room, userId) {
  return `${room}\u0000${userId}`;
}

function isRevoked(room, userId) {
  if (!room || !userId) return false;

  const key = revokedKey(room, userId);
  const expiresAt = revoked.get(key);
  if (!expiresAt) return false;

  if (expiresAt <= Date.now()) {
    revoked.delete(key);
    return false;
  }

  return true;
}

function parseRoomAndUserId(request) {
  let url;
  try {
    url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  } catch {
    return { room: '', userId: '' };
  }

  const room = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const userId = url.searchParams.get('userId') || '';
  return { room, userId };
}

function closeConnection(connection) {
  // 4001 is an application-specific close code the client listens for. The
  // reason is intentionally short; the browser exposes it as `event.reason`.
  try {
    connection.close(4001, 'access-revoked');
  } catch {
    connection.terminate();
  }
}

/**
 * Close every socket belonging to `userId` in `room`, and block reconnects until
 * `/allow` is called or the revocation TTL expires.
 */
function kickUser(room, userId) {
  revoked.set(revokedKey(room, userId), Date.now() + revokeTtlMs);

  const matched = new Set();

  // Preferred path: match the awareness state the client publishes. A single
  // socket can control several Yjs client IDs, so resolve them through
  // `doc.conns`.
  const doc = docs.get(room);
  if (doc) {
    doc.awareness.getStates().forEach((state, clientId) => {
      if (!state || typeof state !== 'object') return;
      const user = state.user;
      if (!user || typeof user !== 'object' || user.id !== userId) return;

      doc.conns.forEach((controlledIds, connection) => {
        if (controlledIds.has(clientId)) matched.add(connection);
      });
    });
  }

  // Fallback: sockets that declared their user ID in the URL. This also covers
  // the brief window before the first awareness update arrives.
  for (const connection of connections) {
    if (connection.collabRoom === room && connection.collabUserId === userId) {
      matched.add(connection);
    }
  }

  for (const connection of matched) {
    closeConnection(connection);
  }

  return matched.size;
}

function allowUser(room, userId) {
  revoked.delete(revokedKey(room, userId));
}

function isLoopback(address) {
  if (!address) return false;
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('127.')
  );
}

function isControlAuthorized(request) {
  const provided = request.headers['x-collab-secret'];

  if (!controlSecret) {
    return isLoopback(request.socket.remoteAddress);
  }

  if (typeof provided !== 'string') return false;

  const expectedBuffer = Buffer.from(controlSecret);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 8 * 1024) {
        reject(new Error('Request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  let pathname = '/';
  try {
    pathname = new URL(
      request.url || '/',
      `http://${request.headers.host || 'localhost'}`
    ).pathname;
  } catch {
    // Keep the default path; the generic response below is harmless.
  }

  if (request.method === 'POST' && (pathname === '/kick' || pathname === '/allow')) {
    if (!isControlAuthorized(request)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const room = typeof body?.room === 'string' ? body.room.trim() : '';
      const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';

      if (!room || !userId) {
        sendJson(response, 400, { error: 'room and userId are required' });
        return;
      }

      if (pathname === '/kick') {
        const closed = kickUser(room, userId);
        console.log(`[collab] Revoked ${userId} from ${room} (closed ${closed} socket(s))`);
        sendJson(response, 200, { ok: true, closed });
      } else {
        allowUser(room, userId);
        console.log(`[collab] Restored access for ${userId} in ${room}`);
        sendJson(response, 200, { ok: true });
      }
    } catch (error) {
      sendJson(response, 400, { error: error.message || 'Bad request' });
    }
    return;
  }

  if (request.method === 'GET' && pathname === '/health') {
    sendJson(response, 200, { ok: true, connections: connections.size });
    return;
  }

  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Schematic collaboration server is running.\n');
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (connection, request) => {
  const { room, userId } = parseRoomAndUserId(request);
  connection.collabRoom = room;
  connection.collabUserId = userId;
  connections.add(connection);

  connection.on('close', () => {
    connections.delete(connection);
  });

  setupWSConnection(connection, request, { gc: true });
});

server.on('upgrade', (request, socket, head) => {
  const { room, userId } = parseRoomAndUserId(request);

  // Refuse reconnects from removed collaborators until access is restored or
  // the revocation expires. Returning HTTP 403 makes the browser's WebSocket
  // handshake fail, so y-websocket will keep retrying but never rejoin.
  if (isRevoked(room, userId)) {
    socket.write(
      'HTTP/1.1 403 Forbidden\r\n' +
        'Connection: close\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n'
    );
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Periodically drop expired revocation entries so the map cannot grow forever.
const revokePruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of revoked) {
    if (expiresAt <= now) revoked.delete(key);
  }
}, 10 * 60 * 1000);
revokePruneTimer.unref();

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.warn(
      `[collab] Port ${port} is already in use. Reusing the collaboration server that is already running.`
    );
    // Exit successfully so `concurrently --kill-others-on-fail` keeps the web
    // dev server alive when another terminal already owns the collab port.
    process.exit(0);
  }

  console.error('[collab] Server error:', error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`[collab] Yjs WebSocket server listening on ws://${host}:${port}`);
  if (!controlSecret) {
    console.log('[collab] Control endpoints accept loopback requests only (set COLLAB_CONTROL_SECRET to change).');
  }
});

function shutdown() {
  console.log('\n[collab] Shutting down...');
  wss.close();
  server.close(() => process.exit(0));
  // Do not hang forever if a socket refuses to close.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
