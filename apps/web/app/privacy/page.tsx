export default function PrivacyPage() {
  const effectiveDate = 'June 2025';

  return (
    <div className="inner-page">
      <div className="inner-content">
        <h1>Privacy Policy</h1>
        <p className="inner-lead">
          Effective {effectiveDate}. CodeRelay is an open-source collaborative coding
          tool. This policy explains what data is collected, how it is used, and how
          it is stored.
        </p>

        <div className="inner-section">
          <h2><i className="fa-solid fa-database" /> Data we collect</h2>
          <p>
            CodeRelay collects only the minimum data needed to operate the service:
          </p>
          <ul>
            <li><strong>Workspace content</strong> — code files and stdin you write are stored in the database to support real-time sync and reconnect.</li>
            <li><strong>Run records</strong> — metadata about each code run (language, timestamps, exit code) is stored for display in the workspace.</li>
            <li><strong>Session identifiers</strong> — a randomly generated session ID is stored in a secure cookie to associate you with a workspace session.</li>
            <li><strong>Invite tokens</strong> — single-use invite tokens are stored as hashed values (SHA-256 with a server-side pepper). The raw token is never persisted.</li>
          </ul>
          <p>We do <strong>not</strong> collect names, email addresses, IP addresses, or any personally identifying information.</p>
        </div>

        <hr className="inner-divider" />

        <div className="inner-section">
          <h2><i className="fa-solid fa-cookie-bite" /> Cookies</h2>
          <p>
            One cookie is set when you redeem a guest invite:
          </p>
          <ul>
            <li><strong>guest_session</strong> — a random session token. Set as <code>HttpOnly</code>, <code>SameSite=Lax</code>, and <code>Secure</code> in production. Expires after 7 days.</li>
          </ul>
          <p>
            No analytics, tracking, or advertising cookies are used.
          </p>
        </div>

        <hr className="inner-divider" />

        <div className="inner-section">
          <h2><i className="fa-solid fa-shield-halved" /> How data is stored</h2>
          <ul>
            <li>Workspace and run data is stored in a <strong>PostgreSQL</strong> database.</li>
            <li>Real-time collaboration state is held in memory by the Hocuspocus server and is not persisted independently.</li>
            <li>Run output events are published over <strong>Redis</strong> and are ephemeral — they are not stored to disk.</li>
            <li>Code execution happens inside isolated <strong>Kubernetes Jobs</strong>. No code is retained by the executor after a run completes.</li>
          </ul>
        </div>

        <hr className="inner-divider" />

        <div className="inner-section">
          <h2><i className="fa-solid fa-share-nodes" /> Third-party services</h2>
          <p>
            CodeRelay uses the following third-party CDN for icons only:
          </p>
          <ul>
            <li><strong>Font Awesome CDN</strong> (cdnjs.cloudflare.com) — serves icon fonts. No user data is transmitted beyond a standard HTTP request for the CSS file.</li>
          </ul>
          <p>No analytics, error-tracking, or advertising third parties are embedded.</p>
        </div>

        <hr className="inner-divider" />

        <div className="inner-section">
          <h2><i className="fa-solid fa-trash-can" /> Data retention</h2>
          <p>
            Workspace data and run records are retained until the workspace is deleted.
            Guest sessions expire after 7 days. There is currently no self-service
            account deletion because no user accounts exist — sessions are anonymous.
          </p>
        </div>

        <hr className="inner-divider" />

        <div className="inner-section">
          <h2><i className="fa-solid fa-envelope" /> Contact</h2>
          <p>
            Questions about this policy? See the <a href="/contact">Contact</a> page.
          </p>
        </div>
      </div>
    </div>
  );
}
