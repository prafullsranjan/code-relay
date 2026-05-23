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
export declare class FakePrisma {
    workspaces: Map<string, Workspace>;
    invites: Map<string, Invite>;
    guestSessions: Map<string, GuestSession>;
    runs: Map<string, Run>;
    runEventsRows: Array<{
        id: number;
        runId: string;
        ts: Date;
        stream: string;
        chunk: string;
    }>;
    private runEventId;
    workspace: {
        create: ({ data }: any) => Promise<Workspace>;
        findUnique: ({ where }: any) => Promise<Workspace | null>;
    };
    invite: {
        create: ({ data }: any) => Promise<Invite>;
        findUnique: ({ where }: any) => Promise<Invite | null>;
        updateMany: ({ where, data }: any) => Promise<{
            count: number;
        }>;
    };
    guestSession: {
        create: ({ data }: any) => Promise<GuestSession>;
        findUnique: ({ where }: any) => Promise<GuestSession | null>;
    };
    run: {
        count: ({ where }: any) => Promise<number>;
        create: ({ data }: any) => Promise<Run>;
        findUnique: ({ where, include }: any) => Promise<Run | {
            workspace: Workspace | undefined;
            id: string;
            workspaceId: string;
            requestedByType: string;
            requestedById: string;
            language: string;
            version?: string;
            status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "TIMEOUT";
            limitsJson: any;
            createdAt: Date;
            startedAt: Date | null;
            finishedAt: Date | null;
            exitCode: number | null;
        } | null>;
        update: ({ where, data }: any) => Promise<any>;
    };
    runEvent: {
        findMany: ({ where }: any) => Promise<{
            id: number;
            runId: string;
            ts: Date;
            stream: string;
            chunk: string;
        }[]>;
    };
    auditEvent: {
        create: () => Promise<{}>;
    };
    $transaction<T>(cb: (tx: FakePrisma) => Promise<T>): Promise<T>;
    addRunEvent(runId: string, stream: string, chunk: string): void;
}
export declare class FakeQueue {
    jobs: any[];
    add(name: string, data: any): Promise<void>;
}
export {};
