// Runs before every UI test file (the "ui" project in vite.config.ts).
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no layout engine and leaves the scrolling methods out. The app only needs
// `scrollTo` to exist.
if (!('scrollTo' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
}

afterEach(() => {
  cleanup();
});
