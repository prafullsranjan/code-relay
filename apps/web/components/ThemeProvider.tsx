'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type AppTheme = 'dark' | 'light';

interface ThemeCtx {
  theme: AppTheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'dark', toggleTheme: () => {} });

function applyClass(t: AppTheme) {
  const root = document.documentElement;
  root.classList.remove('theme-dark', 'theme-light');
  root.classList.add(`theme-${t}`);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('cr-theme') as AppTheme | null;
    const initial: AppTheme = stored === 'light' ? 'light' : 'dark';
    setTheme(initial);
    applyClass(initial);
  }, []);

  function toggleTheme() {
    const next: AppTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('cr-theme', next);
    applyClass(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
