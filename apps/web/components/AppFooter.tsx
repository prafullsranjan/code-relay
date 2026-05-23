export default function AppFooter() {
  return (
    <footer className="app-footer">
      <span className="app-footer-copy">
        &copy; {new Date().getFullYear()} CodeRelay
      </span>
      <nav className="app-footer-nav">
        <a href="/docs">Docs</a>
        <a href="/privacy">Privacy</a>
        <a href="/contact">Contact</a>
      </nav>
    </footer>
  );
}
