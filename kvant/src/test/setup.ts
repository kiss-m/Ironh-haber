// Runs before every UI test file (the "ui" project in vite.config.ts).
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// The real module registers a service worker, which jsdom does not have.
vi.mock('virtual:pwa-register/react', () => import('./pwaRegisterMock.ts'));

// Tests never touch the network. The content they need is seeded straight into the database.
vi.stubGlobal('fetch', () => Promise.reject(new TypeError('The tests have no network.')));

// jsdom has no layout engine and leaves the scrolling methods out. The app only needs them
// to exist.
for (const method of ['scrollTo', 'scrollBy']) {
  if (!(method in Element.prototype)) {
    Object.defineProperty(Element.prototype, method, {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
  }
}

// jsdom has no media queries. Nothing matches, which is also what a default browser reports.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// jsdom knows the <dialog> element but not its methods.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
    close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
}

afterEach(() => {
  cleanup();
});
