import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { FakePrisma, FakeQueue } from './fakes.js';
import { hashInviteToken } from '../src/lib/crypto.js';
import { env } from '../src/lib/env.js';

describe('api flow integration', () => {
  const prisma = new FakePrisma();
  const queue = new FakeQueue();
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ prismaClient: prisma as never, queue: queue as never });
  });

  afterAll(async () => {
    await app.close();
  });

  it('workspace->invite->redeem->guest run authorized', async () => {
    const wsRes = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { title: 'demo', mode: 'LOCAL' },
      headers: { 'x-owner-id': 'owner-1', 'x-owner-email': 'owner-1@example.com' }
    });
    expect(wsRes.statusCode).toBe(201);
    const ws = wsRes.json();

    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${ws.id}/invites`,
      payload: {
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        capabilities: { edit: true, run: true }
      },
      headers: { 'x-owner-id': 'owner-1' }
    });
    expect(inviteRes.statusCode).toBe(201);
    const invitePayload = inviteRes.json() as { inviteId: string; url: string };
    const token = new URL(`https://x${invitePayload.url}`).searchParams.get('t')!;

    const redeemRes = await app.inject({
      method: 'POST',
      url: `/api/invites/${invitePayload.inviteId}/redeem?t=${encodeURIComponent(token)}`
    });
    expect(redeemRes.statusCode).toBe(302);
    const setCookie = redeemRes.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(redeemRes.headers['cache-control']).toBe('no-store');
    expect(redeemRes.headers['referrer-policy']).toBe('no-referrer');

    const runRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${ws.id}/runs`,
      payload: { language: 'node', entryFile: 'index.js' },
      headers: {
        cookie: Array.isArray(setCookie) ? setCookie[0] : setCookie,
        'x-owner-id': 'other-owner'
      }
    });

    expect(runRes.statusCode).toBe(201);
    const run = runRes.json() as { limitsJson: { runtimeClassName: string } };
    expect(run.limitsJson.runtimeClassName).toBe(env.runnerRuntimeClass);
  });

  it('blocks invite creation for GHE_BOUND', async () => {
    const wsRes = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { title: 'locked', mode: 'GHE_BOUND' },
      headers: { 'x-owner-id': 'owner-2' }
    });
    const ws = wsRes.json();

    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${ws.id}/invites`,
      payload: {
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        capabilities: { edit: true, run: true }
      },
      headers: { 'x-owner-id': 'owner-2' }
    });

    expect(inviteRes.statusCode).toBe(403);
  });

  it('stores only hashed invite token', async () => {
    const tokenHash = hashInviteToken('raw', env.invitePepper);
    expect(tokenHash).not.toBe('raw');
  });
});
