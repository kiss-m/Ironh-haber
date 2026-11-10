# Decisions

Where the code refines or deviates from `docs/SPEC.md`, and why. Newest phase last. Keep entries
short: the decision, then the reason.

## Phase 0 · Foundation (2026-11-10)

### Stack and tooling

- **TypeScript 6.0.x, not 7.** typescript-eslint 8.72 supports TypeScript below 6.1 only, and the
  brief asks for ESLint. Move to 7 once typescript-eslint supports it.
- **ESLint 10 with typescript-eslint stays**, although the current Vite template has switched to
  oxlint. The brief names ESLint, and the type-aware rules (`strictTypeChecked`) catch unawaited
  promises, which matters in a code base full of IndexedDB calls.
- **Node 22** (`.nvmrc`, `engines`). It is what the build environment runs, React Router 8 needs
  22.22 or newer, and Node 22 runs `.ts` files natively.
- **Scripts run with plain `node scripts/x.ts`**, without `tsx`. The price is that relative
  imports must carry their extension, so that rule applies to the whole repo. ESLint enforces it,
  and `tsconfig.node.json` (Node resolution) checks it for `shared/` and `scripts/`.
- **Three TypeScript projects.** `tsconfig.app.json` (browser), `tsconfig.node.json` (Vite config,
  scripts) and `tsconfig.core.json`, which re-checks `src/core` and `shared/` with no DOM and no
  Node types. Together with the ESLint rules for those folders this makes the "pure core" rule
  mechanical: `window`, `console`, `new Date()` or `Math.random()` there fail the build.
- **Tailwind CSS 4 is configured in CSS** (`src/styles/index.css`), there is no
  `tailwind.config.js`. The default colour palette is removed. Components use semantic tokens
  that switch with `data-theme`, so no component needs a `dark:` variant.
- **Motion is the `motion` package** (`motion/react`), the successor of `framer-motion`.
- **React Router 8** with `createHashRouter`. Route slugs are Slovak (`#/cesty`, `#/zbierka`,
  `#/postava`) because the address bar shows them.
- **Prettier is part of `npm run lint`.** `docs/SPEC.md` is excluded so it stays verbatim.
- **`npm audit` reports 15 low and moderate advisories**, all in build-time tooling (ESLint's
  `minimatch`, `glob` and `deepmerge` under `workbox-build`). The only offered fix downgrades
  those tools. Nothing of it ships to the browser, so it is left alone.
- **The bundle is split into `react`, `motion`, `vendor` and the app chunk.** Library chunks keep
  their file names between releases, so an ordinary update downloads only the small app chunk.
  Total JavaScript is about 190 kB gzipped: React 68, Motion 47, Dexie 32, React Router 31.

### PWA

- **vite-plugin-pwa 2, `generateSW`, `registerType: 'prompt'`.** The whole app shell is precached.
  `clientsClaim` is on and `skipWaiting` only runs when the user taps "Obnoviť". Without
  `clientsClaim` the first visit stays uncontrolled, and an update arriving during it activated
  at once while the toast still offered a reload that did nothing.
- **Update checks also run when the app returns to the foreground**, at most once an hour. An
  installed app can stay in memory for days, and the browser only checks on a page load.
- **`workbox.cacheId: 'kvant'`** prefixes every cache name (same-origin rule).
- **Content JSON is not precached yet.** There are no packs before Phase 1. That phase decides
  how the precache and the importer's manifest check work together.
- **Icons are rendered by `scripts/generate-icons.ts` with sharp**, not by
  `@vite-pwa/assets-generator`. That generator derives every size from a single image, but a
  good launcher icon needs two sources: a rounded tile and a full-bleed maskable version.
- **GitHub Actions use the newest majors** (checkout 7, setup-node 7, upload-pages-artifact 5,
  deploy-pages 5). The workflow has not run yet: it needs the repository on GitHub.

### Look and feel

- **Fonts are self-hosted from Fontsource:** Bricolage Grotesque for headings and Atkinson
  Hyperlegible Next for body text. Only the latin and latin-ext subsets are bundled (about 113 kB
  in total). Greek letters in card text fall back to the system font.
- **System font scaling.** The root font size is left unset, every size is in rem, and
  `index.html` carries `<meta name="text-scale" content="scale">`, which lets Android's font size
  setting scale the root size (Chrome 146 and newer, according to the web-features data; Chrome's
  own documentation could not be opened from the build environment). This needs an on-device
  check. Layouts are tested with the root size at 130 % and 200 %.
- **The tab bar is the one place capped against font scaling.** Four labels share the width, so
  label, icon and height are limited relative to the viewport.
- **The theme is stored in localStorage (`kvant:theme`), not in the Dexie `settings` row.** An
  inline script in `index.html` must read it before the first paint, and IndexedDB is
  asynchronous. `SettingsRow.theme` stays in the type so a backup can carry the theme later.
- **The theme switch sits on the Postava placeholder** until the Settings screen exists.

### Content schema (`shared/`)

- **Objects are strict.** An unknown key is an error, so a typo in generated content cannot pass.
- **Word and character limits live in the zod schema**, not only in `content:check`, so the
  importer and later the AI features (Phase 5) apply the same limits. A word is a run of
  non-whitespace characters.
- **`recall` is rejected on `quiz`, `myth` and `numeric`**, not merely optional. Those types test
  themselves, and a stray `recall` would never be shown.
- **`volatile: true` requires `validAsOf`. `jurisdiction` stays optional** (a price or a ranking
  has none). Both are rejected on a card that is not volatile.
- **`order` need not be unique within a topic.** Ties are broken by id. Unique orders would force
  renumbering on every insert, and renumbering changes content hashes, which unflags cards.
- **`prerequisites` is required** on a topic and may be empty. Packs are generated, so explicit
  is better than optional.
- **Built packs have their own schemas** (`builtCardSchema`, `builtPackSchema`) that add
  `contentHash`, a lowercase hex digest. Source cards must not carry it.
- **Cross-pack checks stay in `content:check`:** prerequisites that resolve and do not form a
  cycle, ids unique across packs, LaTeX that parses. The pack schema checks one pack.
- **The curriculum YAML schema comes with Phase 2**, together with the YAML parser.
- **Attribute names live in `src/i18n/sk.ts`, category names in `shared/taxonomy.ts`.** Category
  names are content: scripts compare them with the pack's `category.name`.

### Data model (`src/data/`)

- **Timestamps are epoch milliseconds** and a learning day is a `YYYY-MM-DD` string, so indexes
  sort chronologically.
- **Schema v1 indexes:** `categories` by `attribute`; `topics` by `categoryId`; `cards` by
  `[topicId+order]` and `categoryId`; `cardState` by `srs.due`, `lastSeenAt` and `masteredAt`;
  `reviewLog` by `cardId` and `ts`; `events` by `learningDay` and `type`; `pathProgress` by
  `categoryId`. Booleans cannot be IndexedDB keys, so flags such as `bookmarked`, `flagged` or
  `archived` are filtered in memory, which is cheap at 2 000 cards.
- **`srs.due` is a nested index** on the serialised FSRS card, stored as epoch milliseconds.
  A card without a schedule (`srs: null`) is absent from the index.
- **Row shapes for later phases are provisional** (quests, reminders, achievements, path
  progress, adaptive difficulty, the FSRS record). They are marked in `types.ts`. Fields that are
  not keys or indexes can change without a schema version bump.
