export default function DocsPage() {
  return (
    <div className="inner-page">
      <div className="inner-content">
        <h1>Documentation</h1>
        <p className="inner-lead">
          Everything you need to know about CodeRelay — collaborative workspaces,
          guest invites, live code execution, and the API.
        </p>

        {/* Getting started */}
        <div className="inner-section">
          <h2><i className="fa-solid fa-bolt" /> Getting started</h2>
          <p>
            CodeRelay runs entirely in the browser. No account or install required.
            Create a workspace from the home page, write or paste code, then run it
            with one click.
          </p>
          <ol>
            <li>Open the home page and choose a language.</li>
            <li>Click <strong>Create workspace</strong> - you land in the editor immediately.</li>
            <li>Write code, optionally provide stdin, then press <strong>Run</strong>.</li>
            <li>Output appears in the Build Output panel on the right.</li>
          </ol>
        </div>

        <hr className="inner-divider" />

        {/* Workspaces */}
        <div className="inner-section">
          <h2><i className="fa-solid fa-folder-open" /> Workspaces</h2>
          <p>
            A workspace holds one or more files, a language selection, run history,
            and a list of collaborators. Workspaces come in two modes:
          </p>
          <ul>
            <li><strong>Personal - open Sharing (LOCAL)</strong> - standalone workspace owned by the session creator; supports guest invites.</li>
            <li><strong>Team - organization Only (GHE_BOUND)</strong> - linked to a GitHub Enterprise repository (org-controlled access).</li>
          </ul>
          <p>Your recent workspaces are listed on the home page under <em>My Workspaces</em>.</p>
        </div>

        <hr className="inner-divider" />

        {/* Guest invites */}
        <div className="inner-section">
          <h2><i className="fa-solid fa-user-plus" /> Guest invites</h2>
          <p>
            Owners of a <code>LOCAL</code> workspace can generate a single-use invite link
            from the Share panel in the toolbar. Send the link to a collaborator — when
            they open it, a guest session is created and they land directly in the workspace.
          </p>
          <ul>
            <li>Each invite link can only be redeemed <strong>once</strong>.</li>
            <li>Invites expire after 24 hours by default.</li>
            <li>Guest sessions are stored in a secure, <code>HttpOnly</code> cookie and expire after 7 days.</li>
            <li>Guests receive <code>edit</code> and <code>run</code> capabilities as configured by the owner.</li>
          </ul>
        </div>

        <hr className="inner-divider" />

        {/* Real-time collaboration */}
        <div className="inner-section">
          <h2><i className="fa-solid fa-users" /> Real-time collaboration</h2>
          <p>
            Editor state is synced in real time using <strong>Yjs</strong> CRDTs over a
            WebSocket connection to the Hocuspocus server. All participants see each
            other&apos;s changes instantly with no conflicts.
          </p>
          <ul>
            <li>Multiple cursors and selections are visible across sessions.</li>
            <li>Reconnection is automatic — no data is lost on a brief disconnect.</li>
            <li>Only the most recent run output is replayed on reconnect.</li>
          </ul>
        </div>

        <hr className="inner-divider" />

        {/* Code execution */}
        <div className="inner-section">
          <h2><i className="fa-solid fa-play" /> Code execution</h2>
          <p>
            Run requests are queued in <strong>BullMQ</strong> (Redis-backed) and
            dispatched by the executor service, which creates an isolated Kubernetes Job
            for each run. Output is streamed back to all workspace participants in real time.
          </p>
          <ul>
            <li>Supported languages: Python 3, JavaScript (Node.js), TypeScript, Go, Rust, C, C++, Java, Ruby, PHP, Bash, and more.</li>
            <li>Each run is killed after the configured timeout (default 30 s).</li>
            <li>STDIN is passed to the process before execution begins.</li>
          </ul>
        </div>

        <hr className="inner-divider" />

        {/* Editor features */}
        <div className="inner-section">
          <h2><i className="fa-solid fa-code" /> Editor features</h2>
          <ul>
            <li><strong>Monaco Editor</strong> — same engine as VS Code, with full syntax highlighting and IntelliSense.</li>
            <li><strong>Multiple files</strong> — add, rename, and close tabs; each file is synced independently.</li>
            <li><strong>Beautify</strong> — auto-format the current file with Prettier.</li>
            <li><strong>Upload / Download</strong> — import a local file or export the current file to disk.</li>
            <li><strong>Light / Dark theme</strong> — toggle from the toolbar.</li>
            <li><strong>Persistent state</strong> — code and stdin survive page reloads via <code>localStorage</code>.</li>
          </ul>
        </div>

        <hr className="inner-divider" />

        {/* API overview */}
        <div className="inner-section">
          <h2><i className="fa-solid fa-terminal" /> API overview</h2>
          <p>
            The Fastify API runs on <code>:3001</code> and is proxied under <code>/api</code> in
            the Next.js app. Key endpoints:
          </p>
          <ul>
            <li><code>POST /api/workspaces</code> — create a workspace.</li>
            <li><code>GET /api/workspaces</code> — list workspaces for the current session.</li>
            <li><code>POST /api/workspaces/:id/invites</code> — generate a guest invite.</li>
            <li><code>POST /api/invites/:inviteId/redeem</code> — redeem an invite token and start a guest session.</li>
            <li><code>POST /api/workspaces/:id/runs</code> — queue a code run.</li>
            <li><code>GET /api/workspaces/:id/runs/:runId</code> — get run status.</li>
          </ul>
        </div>

        <hr className="inner-divider" />

        {/* Services */}
        <div className="inner-section">
          <h2><i className="fa-solid fa-server" /> Services</h2>
          <div className="inner-card">
            <div className="inner-card-header">
              <div className="inner-card-icon"><i className="fa-solid fa-globe" /></div>
              <div>
                <h3>web <code className="inner-port-label">:3000</code></h3>
                <p>Next.js 15 App Router — home page, workspace UI, invite redemption.</p>
              </div>
            </div>
          </div>
          <div className="inner-card">
            <div className="inner-card-header">
              <div className="inner-card-icon"><i className="fa-solid fa-bolt" /></div>
              <div>
                <h3>api <code className="inner-port-label">:3001</code></h3>
                <p>Fastify REST API — workspaces, invites, sessions, run management.</p>
              </div>
            </div>
          </div>
          <div className="inner-card">
            <div className="inner-card-header">
              <div className="inner-card-icon"><i className="fa-solid fa-arrows-rotate" /></div>
              <div>
                <h3>collab <code className="inner-port-label">:3002</code></h3>
                <p>Hocuspocus/Yjs server — real-time CRDT sync and run-event WebSocket fan-out.</p>
              </div>
            </div>
          </div>
          <div className="inner-card">
            <div className="inner-card-header">
              <div className="inner-card-icon"><i className="fa-solid fa-microchip" /></div>
              <div>
                <h3>executor</h3>
                <p>BullMQ worker — creates Kubernetes Jobs, monitors run status, publishes output events to Redis.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
