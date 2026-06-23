/**
 * Theme system — single source of truth for available themes and how the
 * active one is persisted/applied. Add a new theme by extending `THEMES`
 * here and adding a matching `[data-theme="…"]` block in `index.css`.
 */

export type Theme = 'light' | 'dark';

export const THEMES: readonly Theme[] = ['light', 'dark'] as const;

/** localStorage key holding the user's explicit choice (absent = follow OS). */
export const THEME_STORAGE_KEY = 'manuscript-theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** The OS-level preference, used when the user hasn't chosen explicitly. */
export function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

/** Resolve the theme to apply: stored choice if any, else the OS preference. */
export function resolveTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    /* localStorage may be unavailable (private mode) — fall back to OS. */
  }
  return systemTheme();
}

/** Reflect the theme on <html> so the CSS tokens switch. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

/**
 * Inline script run before paint to set `data-theme` and avoid a flash of the
 * wrong theme. Kept dependency-free because it is stringified into the document
 * head; mirror any change to `resolveTheme` here.
 */
export const NO_FLASH_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;
