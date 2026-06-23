'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type Theme,
  THEME_STORAGE_KEY,
  applyTheme,
  isTheme,
  resolveTheme,
  systemTheme,
} from '@/lib/theme';

/**
 * Reads/controls the active theme. The no-flash script in the document head
 * sets `data-theme` before React mounts; this hook syncs to it and lets the UI
 * change it. When the user hasn't made an explicit choice, the theme tracks the
 * OS preference live.
 */
export function useTheme() {
  // Start from whatever the no-flash script already applied to <html>.
  const [theme, setThemeState] = useState<Theme>('dark');
  const [hasExplicitChoice, setHasExplicitChoice] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setThemeState(isTheme(current) ? current : resolveTheme());
    try {
      setHasExplicitChoice(isTheme(localStorage.getItem(THEME_STORAGE_KEY)));
    } catch {
      /* ignore */
    }
  }, []);

  // Follow OS changes only while the user hasn't pinned a choice.
  useEffect(() => {
    if (hasExplicitChoice) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const next = systemTheme();
      setThemeState(next);
      applyTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [hasExplicitChoice]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setHasExplicitChoice(true);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}
