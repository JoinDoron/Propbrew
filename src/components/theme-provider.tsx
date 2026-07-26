'use client';

import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import type { Theme } from '@/config/brand';

const STORAGE_KEY = 'cargoflow.theme';

/**
 * The `data-theme` attribute on <html> is the single source of truth. A
 * blocking script sets it before first paint, `useSyncExternalStore` reads it,
 * and `setTheme` writes it. Keeping the DOM authoritative means there is no
 * second copy of the theme to fall out of sync — and no hydration mismatch.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Keep other tabs in step when the preference changes.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
}

// The server has no DOM; the init script corrects the client before paint.
function getServerSnapshot(): Theme {
  return 'light';
}

/**
 * Blocking snippet that applies the persisted theme before first paint.
 * Without it the app renders light, then flips to dark on hydration.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

/**
 * Kept as an explicit mount point so app-wide theme concerns have a home,
 * even though the DOM (not React state) holds the value.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked storage — theme still applies this session.
    }
    listeners.forEach((l) => l());
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme],
  );

  return { theme, setTheme, toggleTheme };
}
