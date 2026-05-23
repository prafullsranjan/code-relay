import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { z } from 'zod';
import type { AuthProvider } from '@coderelay/shared';
import { WorkspaceMode } from '@prisma/client';
import { prisma } from './lib/db.js';
import { DevAuthProvider } from './auth/provider.js';
import { env } from './lib/env.js';
import { generateInviteSecret, hashInviteToken } from './lib/crypto.js';
import { checkConcurrentLimit, checkRunRateLimit } from './lib/quotas.js';
import { runQueue, redisPublish } from './lib/queue.js';
import { redeemInviteAtomic } from './lib/inviteRedeem.js';

const defaultAuthProvider = new DevAuthProvider();

const createWorkspaceSchema = z.object({
  title: z.string().min(1),
  mode: z.enum(['LOCAL', 'GHE_BOUND'])
});

const createInviteSchema = z.object({
  expiresAt: z.string().datetime(),
  capabilities: z.object({
    edit: z.boolean(),
    run: z.boolean()
  })
});

const createRunSchema = z.object({
  language: z.enum([
    'node', 'javascript', 'nodejs', 'react',
    'python',
    'ruby', 'lua', 'php', 'groovy',
    'java', 'c', 'cpp', 'csharp', 'assembly',
    'html', 'mysql', 'postgresql', 'plsql', 'mongodb'
  ]),
  version: z.string().optional(),
  entryFile: z.string().optional(),
  content: z.string().optional(),
  stdin: z.string().optional()
});

async function getOwner(authProvider: AuthProvider, headers: Record<string, string | string[] | undefined>) {
  const owner = await authProvider.getOwnerIdentityFromRequest(headers);
  if (!owner) {
    throw new Error('Owner identity is required');
  }
  return owner;
}

interface AppDeps {
  prismaClient?: typeof prisma;
  authProvider?: AuthProvider;
  queue?: typeof runQueue;
}

export async function buildApp(deps: AppDeps = {}) {
  const app = Fastify({ logger: true });
  const prismaClient = deps.prismaClient ?? prisma;
  const authProvider = deps.authProvider ?? defaultAuthProvider;
  const queue = deps.queue ?? runQueue;
  await app.register(cookie);
  await app.register(cors, { origin: true, credentials: true });

  app.get('/', async () => ({
    service: 'api',
    status: 'ok'
  }));

  app.get('/api/me', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    reply.send({ id: owner.id, email: owner.email });
  });

  app.get('/api/workspaces', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    const workspaces = await prismaClient.workspace.findMany({
      where: { ownerId: owner.id },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(workspaces);
  });

  app.post('/api/workspaces', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    const body = createWorkspaceSchema.parse(req.body);
    const ws = await prismaClient.workspace.create({
      data: {
        ownerId: owner.id,
        title: body.title,
        mode: body.mode as WorkspaceMode
      }
    });
    reply.code(201).send(ws);
  });

  app.get('/api/workspaces/:id', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    const { id } = req.params as { id: string };
    const ws = await prismaClient.workspace.findUnique({ where: { id } });
    if (!ws) {
      return reply.code(404).send({ error: 'workspace_not_found' });
    }

    if (ws.ownerId !== owner.id) {
      const guestSession = req.cookies.guest_session;
      if (!guestSession) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const guest = await prismaClient.guestSession.findUnique({ where: { id: guestSession } });
      if (!guest || guest.workspaceId !== ws.id || guest.status !== 'ACTIVE') {
        return reply.code(403).send({ error: 'forbidden' });
      }
      return reply.send(ws);
    }

    reply.send(ws);
  });

  app.post('/api/workspaces/:id/invites', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    const { id } = req.params as { id: string };
    const body = createInviteSchema.parse(req.body);

    const ws = await prismaClient.workspace.findUnique({ where: { id } });
    if (!ws || ws.ownerId !== owner.id) {
      return reply.code(404).send({ error: 'workspace_not_found' });
    }
    if (ws.mode === 'GHE_BOUND') {
      return reply.code(403).send({ error: 'ghe_bound_workspace_disallows_guest_invites' });
    }

    const secret = generateInviteSecret();
    const invite = await prismaClient.invite.create({
      data: {
        workspaceId: ws.id,
        createdByOwnerId: owner.id,
        tokenHash: hashInviteToken(secret, env.invitePepper),
        capabilitiesJson: body.capabilities,
        expiresAt: new Date(body.expiresAt)
      }
    });

    reply.code(201).send({
      inviteId: invite.id,
      url: `/i/${invite.id}?t=${encodeURIComponent(secret)}`
    });
  });

  app.post('/api/invites/:inviteId/redeem', async (req: any, reply: any) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');

    const { inviteId } = req.params as { inviteId: string };
    const token = (req.query as { t?: string })?.t;
    if (!token) {
      return reply.code(400).send({ error: 'token_missing' });
    }

    const result = await redeemInviteAtomic(prismaClient, {
      inviteId,
      tokenHash: hashInviteToken(token, env.invitePepper)
    });

    if (!result.ok) {
      return reply.code(result.statusCode).send({ error: 'redeem_failed' });
    }

    reply.setCookie('guest_session', result.sessionId, {
      path: '/',
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60
    });

    return reply.redirect(`/w/${result.workspaceId}`, 302);
  });

  app.post('/api/workspaces/:id/runs', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    const { id } = req.params as { id: string };
    const body = createRunSchema.parse(req.body);
    const ws = await prismaClient.workspace.findUnique({ where: { id } });
    if (!ws) {
      return reply.code(404).send({ error: 'workspace_not_found' });
    }

    let actorType: 'OWNER' | 'GUEST' = 'OWNER';
    let actorId = owner.id;

    if (ws.ownerId !== owner.id) {
      const guestCookie = req.cookies.guest_session;
      if (!guestCookie) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const guest = await prismaClient.guestSession.findUnique({ where: { id: guestCookie } });
      if (!guest || guest.workspaceId !== ws.id || guest.status !== 'ACTIVE') {
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (ws.mode !== 'LOCAL') {
        return reply.code(403).send({ error: 'login_required_for_ghe_bound' });
      }
      const caps = guest.capabilitiesJson as { run?: boolean };
      if (!caps.run) {
        return reply.code(403).send({ error: 'run_not_allowed' });
      }
      actorType = 'GUEST';
      actorId = guest.id;
    }

    const since = new Date(Date.now() - 60_000);
    const windowCount = await prismaClient.run.count({
      where: {
        workspace: { ownerId: ws.ownerId },
        createdAt: { gte: since }
      }
    });
    if (!checkRunRateLimit(windowCount, env.maxRunsPerMin)) {
      return reply.code(429).send({ error: 'rate_limit_exceeded' });
    }

    const concurrentCount = await prismaClient.run.count({
      where: {
        workspace: { ownerId: ws.ownerId },
        status: { in: ['QUEUED', 'RUNNING'] }
      }
    });
    if (!checkConcurrentLimit(concurrentCount, env.maxConcurrentRuns)) {
      return reply.code(429).send({ error: 'concurrent_limit_exceeded' });
    }

    const run = await prismaClient.run.create({
      data: {
        workspaceId: ws.id,
        requestedByType: actorType,
        requestedById: actorId,
        language: body.language,
        version: body.version,
        status: 'QUEUED',
        limitsJson: {
          timeoutMs: env.runTimeoutMs,
          cpu: '500m',
          memory: '256Mi',
          runtimeClassName: env.runnerRuntimeClass
        }
      }
    });

    await queue.add('execute', {
      runId: run.id,
      workspaceId: ws.id,
      language: body.language,
      version: body.version,
      entryFile: body.entryFile,
      content: body.content,
      stdin: body.stdin,
      runtimeClassName: env.runnerRuntimeClass,
      timeoutMs: env.runTimeoutMs
    });

    // Notify all collaborators that a new run is starting so they can
    // clear their output panels and show the running indicator.
    void redisPublish
      .publish(`workspace:${ws.id}:runs`, JSON.stringify({ type: 'run.start', workspaceId: ws.id, runId: run.id }))
      .catch(() => { /* Redis unavailable — non-fatal, clients degrade gracefully */ });

    reply.code(201).send(run);
  });

  app.delete('/api/workspaces/:id', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    const { id } = req.params as { id: string };
    const ws = await prismaClient.workspace.findUnique({ where: { id } });
    if (!ws) return reply.code(404).send({ error: 'workspace_not_found' });
    if (ws.ownerId !== owner.id) return reply.code(403).send({ error: 'forbidden' });
    await prismaClient.workspace.delete({ where: { id } });
    reply.send({ ok: true });
  });

  app.patch('/api/workspaces/:id', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    const { id } = req.params as { id: string };
    const { title } = (req.body ?? {}) as { title?: string };
    if (!title?.trim()) return reply.code(400).send({ error: 'title_required' });
    const ws = await prismaClient.workspace.findUnique({ where: { id } });
    if (!ws) return reply.code(404).send({ error: 'workspace_not_found' });
    if (ws.ownerId !== owner.id) return reply.code(403).send({ error: 'forbidden' });
    const updated = await prismaClient.workspace.update({ where: { id }, data: { title: title.trim() } });
    reply.send(updated);
  });

  app.post('/api/runs/:runId/cancel', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    const { runId } = req.params as { runId: string };
    const run = await prismaClient.run.findUnique({ where: { id: runId }, include: { workspace: true } });
    if (!run || run.workspace.ownerId !== owner.id) {
      return reply.code(404).send({ error: 'run_not_found' });
    }
    await prismaClient.run.update({ where: { id: run.id }, data: { status: 'CANCELED', finishedAt: new Date() } });
    reply.send({ ok: true });
  });

  app.get('/api/runs/:runId/events', async (req: any, reply: any) => {
    const owner = await getOwner(authProvider, req.headers as Record<string, string | string[] | undefined>);
    const { runId } = req.params as { runId: string };
    const since = (req.query as { since?: string })?.since;
    const run = await prismaClient.run.findUnique({ where: { id: runId }, include: { workspace: true } });
    if (!run) {
      return reply.code(404).send({ error: 'run_not_found' });
    }

    if (run.workspace.ownerId !== owner.id) {
      const guestCookie = req.cookies.guest_session;
      if (!guestCookie) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const guest = await prismaClient.guestSession.findUnique({ where: { id: guestCookie } });
      if (!guest || guest.workspaceId !== run.workspaceId || guest.status !== 'ACTIVE') {
        return reply.code(403).send({ error: 'forbidden' });
      }
    }

    const events = await prismaClient.runEvent.findMany({
      where: {
        runId,
        ...(since
          ? Number.isNaN(Number(since))
            ? { ts: { gt: new Date(since) } }
            : { id: { gt: Number(since) } }
          : {})
      },
      orderBy: { id: 'asc' }
    });

    reply.send({ events });
  });

  return app;
}
