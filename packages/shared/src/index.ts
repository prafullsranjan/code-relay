export type WorkspaceMode = 'LOCAL' | 'GHE_BOUND';

export type ActorType = 'OWNER' | 'GUEST';

export interface InviteCapabilities {
  edit: boolean;
  run: boolean;
}

export interface OwnerIdentity {
  id: string;
  email: string;
}

export interface GuestIdentity {
  sessionId: string;
  workspaceId: string;
  ownerId: string;
  capabilities: InviteCapabilities;
}

export type RequestActor =
  | { type: 'OWNER'; owner: OwnerIdentity }
  | { type: 'GUEST'; guest: GuestIdentity };

export interface AuthProvider {
  getOwnerIdentityFromRequest(headers: Record<string, string | string[] | undefined>): Promise<OwnerIdentity | null>;
}

export interface CreateWorkspaceInput {
  title: string;
  mode: WorkspaceMode;
}

export interface CreateInviteInput {
  expiresAt: string;
  capabilities: InviteCapabilities;
}

export interface CreateRunInput {
  language: 'node' | 'python';
  version?: string;
  entryFile?: string;
}

export interface RunLimits {
  timeoutMs: number;
  cpu: string;
  memory: string;
}
