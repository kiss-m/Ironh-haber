import { vi } from 'vitest';

/**
 * A stand-in for `virtual:pwa-register/react`. The real module registers a service worker, which
 * jsdom does not have. setup.ts puts it in place for every UI test. Tests set the flags and
 * assert on the spies.
 */
export const pwa = {
  needRefresh: false,
  offlineReady: false,
  setNeedRefresh: vi.fn<(value: boolean) => void>(),
  setOfflineReady: vi.fn<(value: boolean) => void>(),
  updateServiceWorker: vi.fn<(reloadPage?: boolean) => Promise<void>>(() => Promise.resolve()),
};

export function resetPwaMock(): void {
  pwa.needRefresh = false;
  pwa.offlineReady = false;
  pwa.setNeedRefresh.mockClear();
  pwa.setOfflineReady.mockClear();
  pwa.updateServiceWorker.mockClear();
}

export function useRegisterSW() {
  return {
    needRefresh: [pwa.needRefresh, pwa.setNeedRefresh] as const,
    offlineReady: [pwa.offlineReady, pwa.setOfflineReady] as const,
    updateServiceWorker: pwa.updateServiceWorker,
  };
}
