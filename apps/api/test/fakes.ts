import { InviteStatus, SessionStatus } from '@prisma/client';

type Workspace = {
  id: string;
  ownerId: string;
  mode: 'LOCAL' | 'GHE_BOUND';
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type Invite = {
  id: string;
  workspaceId: string;
  createdByOwnerId: string;
  tokenHash: string;
  capabilitiesJson: unknown;
  status: InviteStatus;
  expiresAt: Date;
  redeemedAt: Date | null;
  redeemedSessionId: string | null;
};

type GuestSession = {
  id: string;
  workspaceId: string;
  ownerId: string;
  capabilitiesJson: any;
  status: SessionStatus;
  expiresAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
};

type Run = {
  id: string;
  workspaceId: string;
  requestedByType: string;
  requestedById: string;
  language: string;
  version?: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'TIMEOUT';
  limitsJson: any;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  exitCode: number | null;
};

let seq = 1;
const id = () => `id-${seq++}`;

export class FakePrisma {
  workspaces = new Map<string, Workspace>();
  invites = new Map<string, Invite>();
  guestSessions = new Map<string, GuestSession>();
  runs = new Map<string, Run>();
  runEventsRows: Array<{ id: number; runId: string; ts: Date; stream: string; chunk: string }> = [];
  private runEventId = 1;

  workspace = {
    create: async ({ data }: any) => {
      const row: Workspace = {
        id: id(),
        ownerId: data.ownerId,
        title: data.title,
        mode: data.mode,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.workspaces.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: any) => this.workspaces.get(where.id) ?? null
  };

  invite = {
    create: async ({ data }: any) => {
      const row: Invite = {
        id: id(),
        workspaceId: data.workspaceId,
        createdByOwnerId: data.createdByOwnerId,
        tokenHash: data.tokenHash,
        capabilitiesJson: data.capabilitiesJson,
        status: InviteStatus.PENDING,
        expiresAt: data.expiresAt,
        redeemedAt: null,
        redeemedSessionId: null
      };
      this.invites.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: any) => this.invites.get(where.id) ?? null,
    updateMany: async ({ where, data }: any) => {
      const row = this.invites.get(where.id);
      if (!row) {
        return { count: 0 };
      }
      if (
        row.tokenHash !== where.tokenHash ||
        row.status !== where.status ||
        row.expiresAt <= where.expiresAt.gt
      ) {
        return { count: 0 };
      }
      row.status = data.status;
      row.redeemedAt = data.redeemedAt;
      row.redeemedSessionId = data.redeemedSessionId;
      this.invites.set(row.id, row);
      return { count: 1 };
    }
  };

  guestSession = {
    create: async ({ data }: any) => {
      const row: GuestSession = {
        id: data.id,
        workspaceId: data.workspaceId,
        ownerId: data.ownerId,
        capabilitiesJson: data.capabilitiesJson,
        status: data.status,
        expiresAt: data.expiresAt,
        lastSeenAt: new Date(),
        createdAt: new Date()
      };
      this.guestSessions.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: any) => this.guestSessions.get(where.id) ?? null
  };

  run = {
    count: async ({ where }: any) => {
      return Array.from(this.runs.values()).filter((r) => {
        if (where.workspace?.ownerId) {
          const ws = this.workspaces.get(r.workspaceId);
          if (!ws || ws.ownerId !== where.workspace.ownerId) {
            return false;
          }
        }
        if (where.createdAt?.gte && r.createdAt < where.createdAt.gte) {
          return false;
        }
        if (where.status?.in && !where.status.in.includes(r.status)) {
          return false;
        }
        return true;
      }).length;
    },
    create: async ({ data }: any) => {
      const row: Run = {
        id: id(),
        workspaceId: data.workspaceId,
        requestedByType: data.requestedByType,
        requestedById: data.requestedById,
        language: data.language,
        version: data.version,
        status: data.status,
        limitsJson: data.limitsJson,
        createdAt: new Date(),
        startedAt: null,
        finishedAt: null,
        exitCode: null
      };
      this.runs.set(row.id, row);
      return row;
    },
    findUnique: async ({ where, include }: any) => {
      const run = this.runs.get(where.id);
      if (!run) {
        return null;
      }
      if (include?.workspace) {
        return { ...run, workspace: this.workspaces.get(run.workspaceId) };
      }
      return run;
    },
    update: async ({ where, data }: any) => {
      const run = this.runs.get(where.id);
      if (!run) {
        throw new Error('run not found');
      }
      const updated = { ...run, ...data };
      this.runs.set(where.id, updated);
      return updated;
    }
  };

  runEvent = {
    findMany: async ({ where }: any) => {
      return this.runEventsRows.filter((r) => {
        if (r.runId !== where.runId) {
          return false;
        }
        if (where.id?.gt && r.id <= where.id.gt) {
          return false;
        }
        if (where.ts?.gt && r.ts <= where.ts.gt) {
          return false;
        }
        return true;
      });
    }
  };

  auditEvent = {
    create: async () => ({})
  };

  async $transaction<T>(cb: (tx: FakePrisma) => Promise<T>): Promise<T> {
    return cb(this);
  }

  addRunEvent(runId: string, stream: string, chunk: string) {
    this.runEventsRows.push({ id: this.runEventId++, runId, stream, chunk, ts: new Date() });
  }
}

export class FakeQueue {
  jobs: any[] = [];

  async add(name: string, data: any) {
    this.jobs.push({ name, data });
  }
}
