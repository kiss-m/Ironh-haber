import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

/**
 * GitHub Pages serves the app from https://<user>.github.io/kvant/. Other apps live on the same
 * origin, so everything Kvant owns stays under this path: built assets, the web manifest and the
 * service worker scope.
 */
const BASE = '/kvant/';

/** The dark theme background (`--kv-bg` in src/styles/index.css), used for the splash screen. */
const DARK_BACKGROUND = '#0b0d12';

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries go into their own chunks. Their file names only change when a dependency
        // changes, so an ordinary app update re-downloads the small app chunk and nothing else.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules\/(?:react|react-dom|scheduler)\// },
            {
              name: 'motion',
              test: /node_modules\/(?:motion|motion-dom|motion-utils|framer-motion)\//,
            },
            { name: 'vendor', test: /node_modules\// },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': a new version waits until the user taps "Obnoviť" in the toast (PwaToasts.tsx).
      registerType: 'prompt',
      // The app registers the worker itself through virtual:pwa-register/react.
      injectRegister: false,
      scope: BASE,
      // The glob below already precaches every icon; listing them again would duplicate entries.
      includeManifestIcons: false,
      manifest: {
        id: BASE,
        name: 'Kvant',
        short_name: 'Kvant',
        description: 'Mikroučenie namiesto doomscrollingu: jedna karta, jedna myšlienka.',
        lang: 'sk',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: DARK_BACKGROUND,
        theme_color: DARK_BACKGROUND,
        categories: ['education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Prefixes every cache name, so nothing collides with other apps on the origin.
        cacheId: 'kvant',
        // The whole app shell is precached: after the first load the app runs offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Only removes precaches of older Workbox versions registered under this scope.
        cleanupOutdatedCaches: true,
        // The worker takes control of the page that installed it. Without this the very first
        // visit stays uncontrolled, and an update arriving during it would activate at once
        // instead of waiting for the "Obnoviť" prompt.
        clientsClaim: true,
      },
    }),
  ],
  test: {
    // Day boundaries are local time. Pin the zone so the tests mean the same on every machine.
    env: { TZ: 'Europe/Prague' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'shared/**/*.test.ts',
            'scripts/**/*.test.ts',
            'src/core/**/*.test.ts',
            'src/data/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/core/**', 'src/data/**'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
});
