'use client';

import dynamic from 'next/dynamic';

function WorkspacePageLoader() {
  return (
    <div className="ws-page-loader">
      <img src="/icon.svg" alt="CodeRelay" className="ws-page-loader-icon" />
      <span className="ws-page-loader-label">Loading workspace…</span>
    </div>
  );
}

const WorkspaceClient = dynamic(
  () => import('../../../components/WorkspaceClient').then(m => m.WorkspaceClient),
  { ssr: false, loading: () => <WorkspacePageLoader /> }
);

export default function WorkspaceLoader({ workspaceId }: { workspaceId: string }) {
  return <WorkspaceClient workspaceId={workspaceId} />;
}
