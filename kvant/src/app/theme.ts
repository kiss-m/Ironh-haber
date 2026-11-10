import { create } from 'zustand';
import type { ThemeName } from '../data/types.ts';
import { THEME_STORAGE_KEY } from './storageKeys.ts';

export const DEFAULT_THEME: ThemeName = 'dark';

/** `--kv-bg` of each theme (src/styles/index.css). Colours the browser and system bars. */
const THEME_COLOR: Record<ThemeName, string> = {
  dark: '#0b0d12',
  light: '#f5f2ea',
};

function isThemeName(value: unknown): value is ThemeName {
  return value === 'dark' || value === 'light';
}

function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

/**
 * The theme is a per-device preference kept in localStorage, not in IndexedDB: the inline script
 * in index.html has to read it synchronously to avoid a flash of the wrong theme on start.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be blocked or full. The theme still applies until the app is closed.
    }
    set({ theme });
  },
}));
