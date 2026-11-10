# Kvant: rules for Claude Code

Kvant is a personal micro-learning PWA that replaces doomscrolling. It keeps the gesture of a
social feed (full-screen cards, swipe up) but every card teaches one idea. Quizzes on cards already
seen are mixed in with FSRS spacing, and an RPG character grows with what is learned.

Every session starts by reading this file and `docs/SPEC.md`.

- `docs/SPEC.md` is the build brief, stored verbatim. It is the source of truth. Never edit or
  reformat it (Prettier ignores it). Read the sections that matter for the task before you start.
- `docs/DECISIONS.md` is the decision log: every place where the code refines or deviates from
  the brief, with the reason. Add an entry whenever you choose something the brief leaves open or
  gets wrong for current library versions.

## Working with the user

- Talk to the user in **Slovak**. Code, identifiers, comments, commit messages and repo docs are
  in **English**.
- Every user-facing string in the app is **Slovak** and lives in `src/i18n/sk.ts`. The only
  exceptions are the web manifest strings in `vite.config.ts`, the static fallback text in
  `index.html`, and learning content, which lives in content packs.
- Tone of the app: calm, informal "ty", no guilt-tripping anywhere. Prefer wording that does not
  need a gendered past-tense form.
- Work **one phase per session** (SPEC section 12). Start with a short plan in Slovak (at most 10
  bullets), then implement it.
- At the end of a phase run the phase gate (below), commit, and give a Slovak summary: what is
  done, how to try it on the phone, what comes next. Then **stop and wait for "continue"**.
- Ask only when a decision is genuinely the user's. Otherwise pick a sensible default and log it.
- **Do not guess library APIs.** The stack is newer than most training data. Read the installed
  package's types and docs in `node_modules` before using an API.

## Commands

```sh
npm ci                # install exactly what package-lock.json says
npm run dev           # dev server at http://localhost:5173/kvant/ (no service worker)
npm run build         # typecheck, then production build into dist/
npm run preview       # serve dist/ at http://localhost:4173/kvant/ (with the service worker)
npm run typecheck     # tsc -b over the three projects (app, core, node)
npm run lint          # ESLint, then Prettier in check mode
npm run format        # Prettier, writing
npm test              # Vitest, once
npm run test:watch    # Vitest, watching
npm run icons         # re-render the PNG icons after editing assets/brand/*.svg
npm run check         # the phase gate: typecheck + lint + test
```

**Phase gate:** `npm run check` and `npm run build` must pass. Once `content:check` exists
(Phase 2) it is part of the gate too. For anything that touches the PWA shell, also load the
built app from `npm run preview` in a real browser and check it offline.

Node 22.22 or newer is required (`.nvmrc`). Scripts in `scripts/` run with plain
`node scripts/name.ts`: Node strips the types itself, so there is no `tsx` or `ts-node`.

## Stack

React 19, Vite 8, TypeScript 6.0 (strict), Tailwind CSS 4, React Router 8 (hash router), Zustand 5,
Dexie 4 with `dexie-react-hooks`, zod 4, Motion (`motion/react`), lucide-react, vite-plugin-pwa 2
(Workbox), Vitest 5 with jsdom, `fake-indexeddb` and React Testing Library, ESLint 10 with
typescript-eslint, Prettier 3. Still to be added when their phase needs them: `ts-fsrs` and KaTeX
(Phase 1), `web-push` (Phase 3).

TypeScript stays on 6.0.x until typescript-eslint supports 7 (see DECISIONS).

## Rules

- **Pure core.** All domain logic lives in `src/core` as pure TypeScript: no React, DOM, Dexie or
  Node imports. The clock (`now: Date`) and randomness (`rng: () => number`) are parameters, never
  `new Date()`, `Date.now()` or `Math.random()`. `shared/` follows the same rule. Both are
  enforced twice: ESLint (`eslint.config.js`) and `tsconfig.core.json`, which compiles the two
  folders without DOM and Node types.
- **Same-origin rule.** Other apps of the user are served from the same `<user>.github.io` origin.
  Kvant owns exactly: the IndexedDB database `kvant`, localStorage keys starting with `kvant:`
  (`src/app/storageKeys.ts`), Cache Storage names starting with `kvant-`, and the service worker
  scope `/kvant/`. Never read, list or clear any other storage.
- **No network outside the app's own origin.** No analytics, no CDN fonts, no external images.
  Fonts are self-hosted through `src/styles/fonts.css`.
- **No `any`** in `src/core` or `shared/`. TypeScript is strict everywhere, with
  `noUncheckedIndexedAccess`.
- **Relative imports carry the file extension** (`./day.ts`, `./App.tsx`) everywhere, because
  Node runs `shared/` and `scripts/` without a bundler. ESLint enforces it.
- **Never load all cards into React state.** Query IndexedDB by index
  (`useLiveQuery` for live data).
- **Dexie schema changes** add a new `db.version(n)` in `src/data/db.ts`. Never edit a version
  that has shipped. Row fields that are not keys or indexes can change without a version bump.
- **Content ids are permanent** (`shared/ids.ts`). A substantial rewrite gets a new id and the
  old card is archived. The importer never touches user state.
- **Styling.** Use the semantic colour tokens (`bg-surface`, `text-muted`, `text-accent-fg`,
  `bg-attr-t` …) defined in `src/styles/index.css`. Tailwind's default palette is removed on
  purpose. Sizes are in rem and the root font size stays unset, so the system font scale works.
  Body text is `text-base` = 18 px. Check new screens at 360 px width, in both themes, and with
  the root font size at 130 % and 200 %.
- **Accessibility.** Labels on icon-only buttons, visible focus, touch targets of at least 48 px,
  AA contrast, and animations that respect reduced motion (`MotionConfig reducedMotion="user"`
  plus the CSS rule in `index.css`).
- **Tests.** Every module in `src/core` gets unit tests. Data-layer tests use `fake-indexeddb`.
  Test files sit next to the code as `*.test.ts(x)`. Tests in `shared/`, `scripts/`, `src/core`
  and `src/data` run in Node, all other tests in `src/` run in jsdom (`vite.config.ts`).

## Folder map

```
CLAUDE.md
docs/                 SPEC.md (verbatim brief), DECISIONS.md, CONTENT_GUIDE.md (Phase 2)
.github/workflows/    ci-deploy.yml: typecheck, lint, test, build, deploy to GitHub Pages
assets/brand/         icon.svg and icon-maskable.svg, the sources of the PNG icons
public/               favicon.svg, icons/ (generated by `npm run icons`), content/ (Phase 1)
scripts/              generate-icons.ts; content-check.ts and content-build.ts come in Phase 2
shared/               schema.ts (zod), ids.ts, taxonomy.ts: used by the app and by scripts
content/              curriculum/, packs/, reviews/ (from Phase 1 and 2)
src/
  main.tsx            entry
  env.d.ts            build-time globals
  app/                App, routes, paths, AppLayout, TabBar, PwaToasts, theme, storageKeys
  components/ui/      Screen, Button, Toast, ComingSoon, BrandMark, EnergyLevels
  components/cards/   one component per card type (Phase 1)
  core/               pure domain logic (from Phase 1): config, day, mixer, srs, xp, …
  data/               db.ts (Dexie schema), types.ts (row types); repositories, importer, backup later
  features/           feed, paths, collection, character, settings; onboarding, review, stats later
  i18n/sk.ts          every Slovak UI string
  styles/             index.css (tokens, themes, base styles), fonts.css
  test/               setup.ts, pwaRegisterMock.ts
```

## Deployment

GitHub Pages under the sub-path `/kvant/`, deployed by `.github/workflows/ci-deploy.yml` on every
push to `main` (Pages source: GitHub Actions). The base path is set once, as `BASE` in
`vite.config.ts`. The service worker uses the prompt strategy: a new version waits until the user
taps "Obnoviť" in the toast, so a learning session is never reloaded mid-card.

## Phase status

- [x] **Phase 0 · Foundation.** Project skeleton, tooling, the four tabs with placeholder
      screens, dark and light theme, Dexie schema v1, zod content schemas, PWA shell with offline
      support and the update prompt, app icon, CI workflow. Verified locally: 105 tests, and the
      built app in headless Chromium (service worker scope, offline start, update flow, storage
      hygiene, 360 px and large-text layouts). **Not yet done:** the first deployment. The code still
      has to be pushed to the `kvant` GitHub repository and Pages enabled, so the workflow has never
      run and the on-device check (install, airplane mode) is open.
- [ ] Phase 1 · Usable feed
- [ ] Phase 2 · Content factory
- [ ] Phase 3 · RPG and stats
- [ ] Phase 4 · Paths and bosses
- [ ] Phase 5 · Optional extras (only when asked)
