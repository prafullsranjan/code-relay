import type { PrismaClient } from '@prisma/client';
import { generateOpaqueId } from './crypto.js';

interface RedeemInput {
  inviteId: string;
  tokenHash: string;
}

type InviteTx = Pick<
  PrismaClient,
  '$transaction'
>;

export async function redeemInviteAtomic(prisma: InviteTx, input: RedeemInput) {
  return prisma.$transaction(async (tx: any) => {
    const invite = await tx.invite.findUnique({ where: { id: input.inviteId } });
    if (!invite) {
      return { ok: false as const, statusCode: 404 as const };
    }

    if (invite.tokenHash !== input.tokenHash) {
      return { ok: false as const, statusCode: 403 as const };
    }

    const sessionId = generateOpaqueId();
    const updated = await tx.invite.updateMany({
      where: {
        id: input.inviteId,
        tokenHash: input.tokenHash,
        status: 'PENDING',
        expiresAt: { gt: new Date() }
      },
      data: {
        status: 'REDEEMED',
        redeemedAt: new Date(),
        redeemedSessionId: sessionId
      }
    });

    if (updated.count !== 1) {
      return { ok: false as const, statusCode: 410 as const };
    }

    const fresh = await tx.invite.findUnique({ where: { id: input.inviteId } });
    if (!fresh) {
      return { ok: false as const, statusCode: 404 as const };
    }

    await tx.guestSession.create({
      data: {
        id: sessionId,
        workspaceId: fresh.workspaceId,
        ownerId: fresh.createdByOwnerId,
        capabilitiesJson: fresh.capabilitiesJson,
        status: 'ACTIVE',
        expiresAt: fresh.expiresAt
      }
    });

    return {
      ok: true as const,
      sessionId,
      workspaceId: fresh.workspaceId
    };
  });
}
