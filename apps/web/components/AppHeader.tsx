'use client';

import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';

export default function AppHeader() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  if (pathname === '/') return null;

  return (
    <header className="app-header">
      <a href="/" className="app-header-brand">
        <img src="/icon.svg" alt="" className="app-header-logo" />
        <span>CodeRelay</span>
      </a>
      <nav className="app-header-nav">
        <a href="/docs">Docs</a>
        <button
          className="app-header-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
        </button>
      </nav>
    </header>
  );
}
