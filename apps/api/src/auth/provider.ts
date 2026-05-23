import type { AuthProvider, OwnerIdentity } from '@coderelay/shared';
import { env } from '../lib/env.js';

export class DevAuthProvider implements AuthProvider {
  async getOwnerIdentityFromRequest(headers: Record<string, string | string[] | undefined>): Promise<OwnerIdentity | null> {
    const headerOwnerId = headers['x-owner-id'];
    const headerOwnerEmail = headers['x-owner-email'];
    if (typeof headerOwnerId === 'string') {
      return {
        id: headerOwnerId,
        email: typeof headerOwnerEmail === 'string' ? headerOwnerEmail : `${headerOwnerId}@local.dev`
      };
    }
    return { id: env.ownerDevId, email: env.ownerDevEmail };
  }
}
