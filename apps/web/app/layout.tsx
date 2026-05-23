import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AppHeader from '../components/AppHeader';
import AppFooter from '../components/AppFooter';
import { ThemeProvider } from '../components/ThemeProvider';

export const metadata: Metadata = {
  title: 'CodeRelay',
  description: 'Real-time collaborative coding with live code execution.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme — synchronously applies stored class before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('cr-theme')||'dark';document.documentElement.classList.add('theme-'+t);})();` }} />
        {/* Font Awesome 6 Free — icons used throughout the app */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body>
        <ThemeProvider>
          <AppHeader />
          <div className="app-main">{children}</div>
          <AppFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
