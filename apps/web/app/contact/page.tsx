export default function ContactPage() {
  return (
    <div className="inner-page">
      <div className="inner-content">
        <h1>Contact</h1>
        <p className="inner-lead">
          CodeRelay is an independent open-source project. Below is the team behind it.
        </p>

        <div className="inner-section">
          <h2><i className="fa-solid fa-people-group" /> Team</h2>
          <div className="inner-contact-grid">
            <div className="inner-person-card">
              <div className="inner-person-avatar">
                <i className="fa-solid fa-user" />
              </div>
              <div>
                <p className="inner-person-name">Prafull Ranjan</p>
                <div className="inner-person-roles">
                  <span className="inner-tag inner-tag-blue">Developer</span>
                  <span className="inner-tag inner-tag-violet">Designer</span>
                  <span className="inner-tag inner-tag-green">Architect</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <hr className="inner-divider" />

        <div className="inner-section">
          <h2><i className="fa-solid fa-code-branch" /> Source code</h2>
          <p>
            CodeRelay is open source. Bugs, feature requests, and pull requests are
            welcome on GitHub.
          </p>
          <p className="inner-source-link-wrap">
            <a href="/github" className="inner-back inner-source-link">
              <i className="fa-brands fa-github" /> View on GitHub
            </a>
          </p>
        </div>

        <hr className="inner-divider" />

        <div className="inner-section">
          <h2><i className="fa-solid fa-circle-info" /> About CodeRelay</h2>
          <p>
            CodeRelay is a real-time collaborative code execution platform. It combines
            a Monaco-based editor, Yjs CRDT sync, Kubernetes-backed execution, and a
            single-use guest invite system — all accessible directly from a browser
            with no account required.
          </p>
        </div>
      </div>
    </div>
  );
}
