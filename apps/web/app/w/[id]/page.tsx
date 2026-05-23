import WorkspaceLoader from './WorkspaceLoader';

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkspaceLoader workspaceId={id} />;
}
