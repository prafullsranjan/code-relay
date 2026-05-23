export interface GheIntegration {
  ensureOwnerRepoAccess(ownerId: string, workspaceId: string): Promise<boolean>;
  getRepoMetadata(workspaceId: string): Promise<{ org: string; repo: string } | null>;
}

export class GheIntegrationStub implements GheIntegration {
  async ensureOwnerRepoAccess(): Promise<boolean> {
    return true;
  }

  async getRepoMetadata(): Promise<{ org: string; repo: string } | null> {
    return null;
  }
}
