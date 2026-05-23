import { describe, expect, it } from 'vitest';
import { hashInviteToken } from '../src/lib/crypto.js';
import { redeemInviteAtomic } from '../src/lib/inviteRedeem.js';
import { FakePrisma } from './fakes.js';

describe('invite redeem concurrency', () => {
  it('allows exactly one success for same invite', async () => {
    const prisma = new FakePrisma();
    const ws = await prisma.workspace.create({
      data: { ownerId: 'owner-1', title: 'ws', mode: 'LOCAL' }
    });
    const tokenHash = hashInviteToken('secret', 'pepper');
    const invite = await prisma.invite.create({
      data: {
        workspaceId: ws.id,
        createdByOwnerId: 'owner-1',
        tokenHash,
        capabilitiesJson: { edit: true, run: true },
        expiresAt: new Date(Date.now() + 60_000)
      }
    });

    const [a, b, c] = await Promise.all([
      redeemInviteAtomic(prisma as never, { inviteId: invite.id, tokenHash }),
      redeemInviteAtomic(prisma as never, { inviteId: invite.id, tokenHash }),
      redeemInviteAtomic(prisma as never, { inviteId: invite.id, tokenHash })
    ]);

    const outcomes = [a, b, c];
    expect(outcomes.filter((o) => o.ok).length).toBe(1);
    expect(outcomes.filter((o) => !o.ok).length).toBe(2);
  });
});
