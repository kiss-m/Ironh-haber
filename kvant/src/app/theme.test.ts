import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_PREFIX, THEME_STORAGE_KEY } from './storageKeys.ts';

/** The store reads localStorage when its module loads, so each test loads a fresh copy. */
async function loadThemeStore() {
  vi.resetModules();
  const { useThemeStore } = await import('./theme.ts');
  return useThemeStore;
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#0b0d12">';
  document.documentElement.dataset.theme = 'dark';
});

describe('theme store', () => {
  it('keeps its key inside the kvant: namespace', () => {
    expect(STORAGE_PREFIX).toBe('kvant:');
    expect(THEME_STORAGE_KEY).toBe('kvant:theme');
  });

  it('starts dark when nothing is stored', async () => {
    const store = await loadThemeStore();

    expect(store.getState().theme).toBe('dark');
  });

  it('starts with the stored theme', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const store = await loadThemeStore();

    expect(store.getState().theme).toBe('light');
  });

  it('ignores a stored value it does not know', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    const store = await loadThemeStore();

    expect(store.getState().theme).toBe('dark');
  });

  it('applies a new theme to the document, the browser bar and storage', async () => {
    const store = await loadThemeStore();

    store.getState().setTheme('light');

    expect(store.getState().theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#f5f2ea',
    );
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    store.getState().setTheme('dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#0b0d12',
    );
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('still switches the theme when storage is blocked', async () => {
    const store = await loadThemeStore();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    store.getState().setTheme('light');

    expect(store.getState().theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    setItem.mockRestore();
  });
});
