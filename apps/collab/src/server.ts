import 'dotenv/config';
import { createServer } from 'node:http';
import { Hocuspocus } from '@hocuspocus/server';
import { PrismaClient } from '@prisma/client';
import { parse as parseCookie } from 'cookie';
import { WebSocket, WebSocketServer } from 'ws';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const redisSub = new Redis(redisUrl);
redisSub.on('error', (err) => {
  console.warn(`collab redis unavailable at ${redisUrl}: ${err.message}`);
});
const ownerDevId = process.env.OWNER_DEV_ID ?? 'owner-dev-1';
const port = Number(process.env.PORT ?? 3002);

async function authorizeWorkspace(workspaceId: string, request: { headers: Record<string, string | string[] | undefined> }) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) {
    return { allowed: false as const, reason: 'workspace_not_found' };
  }

  const headerOwner = request.headers['x-owner-id'];
  if (typeof headerOwner === 'string' && headerOwner === ws.ownerId) {
    return { allowed: true as const, actorType: 'OWNER' as const, actorId: ws.ownerId, workspace: ws };
  }

  if (typeof headerOwner !== 'string' && ownerDevId === ws.ownerId) {
    return { allowed: true as const, actorType: 'OWNER' as const, actorId: ws.ownerId, workspace: ws };
  }

  const rawCookie = request.headers.cookie;
  const cookie = parseCookie(typeof rawCookie === 'string' ? rawCookie : '');
  const guestSession = cookie.guest_session;
  if (!guestSession) {
    return { allowed: false as const, reason: 'unauthorized' };
  }

  if (ws.mode === 'GHE_BOUND') {
    return { allowed: false as const, reason: 'login_required_for_ghe_bound' };
  }

  const guest = await prisma.guestSession.findUnique({ where: { id: guestSession } });
  if (!guest || guest.workspaceId !== ws.id || guest.status !== 'ACTIVE') {
    return { allowed: false as const, reason: 'forbidden' };
  }

  return { allowed: true as const, actorType: 'GUEST' as const, actorId: guest.id, workspace: ws };
}

const hocuspocus = new Hocuspocus({
  async onAuthenticate({ documentName, request }) {
    const workspaceId = documentName.split(':')[0];
    const auth = await authorizeWorkspace(workspaceId, request);
    if (!auth.allowed) {
      throw new Error(auth.reason);
    }
    return {
      actorType: auth.actorType,
      actorId: auth.actorId
    };
  }
});

const httpServer = createServer((_, res) => {
  res.statusCode = 200;
  res.end('ok');
});

const runWss = new WebSocketServer({ noServer: true });
const hocusWss = new WebSocketServer({ noServer: true });
const roomClients = new Map<string, Set<WebSocket>>();

function rejectUpgrade(socket: import('node:stream').Duplex, status: number, reason: string) {
  console.warn(`[collab] ws upgrade rejected ${status}: ${reason}`);
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

httpServer.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  if (url.pathname === '/runs') {
    const workspaceId = url.searchParams.get('workspaceId');
    if (!workspaceId) {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }

    let auth: Awaited<ReturnType<typeof authorizeWorkspace>>;
    try {
      auth = await authorizeWorkspace(workspaceId, { headers: req.headers as Record<string, string> });
    } catch (err) {
      console.error('[collab] authorizeWorkspace threw:', err);
      rejectUpgrade(socket, 503, 'Service Unavailable');
      return;
    }

    if (!auth.allowed) {
      rejectUpgrade(socket, 401, auth.reason);
      return;
    }

    runWss.handleUpgrade(req, socket, head, async (ws) => {
      const key = workspaceId;
      if (!roomClients.has(key)) {
        roomClients.set(key, new Set());
      }
      roomClients.get(key)!.add(ws);

      // Only replay events from the most recent run so the output panel
      // shows only the last execution result, not all history.
      const lastRun = await prisma.run.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });
      const recent = lastRun
        ? await prisma.runEvent.findMany({
            where: { runId: lastRun.id },
            orderBy: { id: 'asc' },
          })
        : [];
      ws.send(JSON.stringify({ type: 'run.replay', events: recent }));

      // Relay editor.update messages (Y.js binary updates) to all other sessions
      // in the same workspace. This is a redundant broadcast channel alongside
      // Hocuspocus — applying the same Y.js update twice is idempotent (Y.js
      // deduplicates by clientID+clock).
      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString()) as { type: string };
          if (msg.type === 'editor.update') {
            const clients = roomClients.get(key);
            if (!clients) return;
            const raw = data.toString();
            for (const c of clients) {
              if (c !== ws && c.readyState === WebSocket.OPEN) {
                c.send(raw);
              }
            }
          }
        } catch { /* ignore malformed messages */ }
      });

      ws.on('close', () => {
        roomClients.get(key)?.delete(ws);
      });
      ws.on('error', () => {
        roomClients.get(key)?.delete(ws);
      });
    });
    return;
  }

  hocusWss.handleUpgrade(req, socket, head, (ws) => {
    hocuspocus.handleConnection(ws, req);
  });
});

void redisSub.psubscribe('workspace:*:runs').then(() => {
  redisSub.on('pmessage', (_pattern, channel, message) => {
    const workspaceId = channel.split(':')[1];
    const clients = roomClients.get(workspaceId);
    if (!clients) {
      return;
    }
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) {
        c.send(message);
      }
    }
  });
}).catch((err) => {
  console.warn(`collab redis subscribe failed: ${err.message}`);
});

httpServer.listen(port, '0.0.0.0');
console.log(`collab listening on :${port}`);
