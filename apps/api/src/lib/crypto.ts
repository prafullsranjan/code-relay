import { createHash, randomBytes } from 'node:crypto';

export function hashInviteToken(raw: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${raw}`).digest('hex');
}

export function generateOpaqueId(): string {
  return randomBytes(24).toString('hex');
}

export function generateInviteSecret(): string {
  return randomBytes(32).toString('base64url');
}
