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
npm run content:build # content/packs/*.json → public/content/ (runs before dev and build)
npm run icons         # re-render the PNG icons after editing assets/brand/*.svg
npm run check         # the phase gate: typecheck + lint + test
```

**Phase gate:** `npm run check` and `npm run build` must pass. Once `content:check` exists
(Phase 2) it is part of the gate too. For anything that touches the feed, the layout or the PWA
shell, also load the built app from `npm run preview` in a real browser: offline, at 320 and
360 px, in both themes, and with the root font size at 130 % and 200 %. jsdom has no layout and no
scrolling, so none of that shows up in the unit tests.

Node 22.22 or newer is required (`.nvmrc`). Scripts in `scripts/` run with plain
`node scripts/name.ts`: Node strips the types itself, so there is no `tsx` or `ts-node`.

## Stack

React 19, Vite 8, TypeScript 6.0 (strict), Tailwind CSS 4, React Router 8 (hash router), Zustand 5,
Dexie 4 with `dexie-react-hooks`, zod 4, ts-fsrs 5, KaTeX 0.19 (its own lazy chunk), Motion
(`motion/react`), lucide-react, vite-plugin-pwa 2 (Workbox), Vitest 5 with jsdom,
`fake-indexeddb` and React Testing Library, ESLint 10 with typescript-eslint, Prettier 3. Still to
be added when its phase needs it: `web-push` (Phase 3).

TypeScript stays on 6.0.x until typescript-eslint supports 7, and ts-fsrs on 5.x until the build
runs on Node 24 (see DECISIONS).

## Rules

- **Pure core.** All domain logic lives in `src/core` as pure TypeScript: no React, DOM, Dexie or
  Node imports. The clock (`now: Date`) and randomness (`rng: () => number`) are parameters, never
  `new Date()`, `Date.now()` or `Math.random()`. `shared/` follows the same rule. Both are
  enforced twice: ESLint (`eslint.config.js`) and `tsconfig.core.json`, which compiles the two
  folders without DOM and Node types.
- **No hard-coded tunables.** Batch sizes, XP, thresholds and the like live in
  `src/core/config.ts`.
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
  (`useLiveQuery` for live data). The mixer works on `loadContentIndex`, a text-free index that is
  cached per content version outside React.
- **Dexie schema changes** add a new `db.version(n)` in `src/data/db.ts`. Never edit a version
  that has shipped. Row fields that are not keys or indexes can change without a version bump.
- **Only `src/data/progress.ts` writes progress.** Every function there is one transaction over
  everything it touches. Screens and the session call these functions, never the tables.
- **Content ids are permanent** (`shared/ids.ts`). A substantial rewrite gets a new id and the
  old card is archived. The importer never touches user state.
- **"Today" is a learning day** (04:00 to 04:00, `src/core/day.ts`). A phone keeps the app in
  memory for days, so nothing may read the day once and keep it: components use
  `useLearningDay()`, and a session starts over when it is shown on another day.
- **Accessibility.** Labels on icon-only buttons, visible focus, touch targets of at least 48 px,
  AA contrast, and animations that respect reduced motion (`MotionConfig reducedMotion="user"`
  plus the CSS rule in `index.css`).

## How the feed counts things

These terms are used the same way in the code, the tests and the database:

- A card is **seen** when it is shown (`recordSeen`): its state and an unrated schedule are
  created, due at the start of the next learning day. It counts toward the daily cap on new cards.
- A card is **read** when the reader stayed 3 s or acted on it (`recordRead`). A read or answered
  card is **counted** toward the daily goal. Only the first reading of a new card earns XP.
- A reading left within 2 s without any action is a **quick skip** and lowers the topic affinity.
  An unanswered quiz or myth is never a skip.
- An answer on a card's **first showing** is an exposure: XP and accuracy, but no FSRS rating.
  An answer to a **retrieval** (`due` or `recent` entries of the feed, everything in a review
  session) is rated. A card is rated at most once per learning day.
- The **feed session** (`src/features/feed/session.ts`) keeps its queue and its place while the
  reader visits other tabs. It starts over on a new learning day and when a setting changes what
  the feed serves. Work that is still running when a session is reset must not write into the
  next one: every `await` in the session is followed by a generation check.

## Styling

- Use the semantic colour tokens (`bg-surface`, `text-muted`, `text-accent-fg`, `bg-attr-t` …)
  defined in `src/styles/index.css`. Tailwind's default palette is removed on purpose.
- Sizes are in rem and the root font size stays unset, so the system font scale works. Body text
  is `text-base` = 18 px and follows the system font without limit.
- What has to fit side by side does **not** grow with the font: the tab bar, the top row of a card
  (`top-row`), the side gutters (`px-gutter`), the action bar, and every text size above the body
  size (capped against the screen width in the theme).
- A touch target in a row of controls is 48 px in **pixels** (`min-h-[48px]`). In rem it doubles
  at 200 % and the row no longer fits.
- Tailwind utilities live in a cascade layer. A stylesheet that is not layered (KaTeX's) wins
  over any utility, so overriding it takes an unlayered rule in `index.css`.
- A card longer than the screen scrolls inside its own area. What a tap reveals goes through
  `useReveal`, which scrolls that area. Never call `scrollIntoView` inside the pager: it moves
  the pager too.

## Tests

- Every module in `src/core` gets unit tests. Data-layer tests use `fake-indexeddb`. Test files
  sit next to the code as `*.test.ts(x)`. Tests in `shared/`, `scripts/`, `src/core` and
  `src/data` run in Node, all other tests in `src/` run in jsdom (`vite.config.ts`). The time
  zone is pinned to Europe/Prague.
- Tests never touch the network (`src/test/setup.ts`). Content is seeded into the database:
  the real seed packs with `seedContent()`, or small predictable packs from `src/test/packs.ts`
  when a test has to know exactly which cards exist.
- `renderApp()` (`src/test/renderApp.tsx`) renders the whole app at a path. In jsdom the pager
  moves with the arrow keys.
- Time: fake only `Date`, `setTimeout` and `clearTimeout`
  (`vi.useFakeTimers({ toFake: [...] })`). fake-indexeddb needs real macrotasks, and Testing
  Library's `findBy…` needs real timers, so for a screen test fake `Date` alone.
- Wait for the last database write of a test before it ends, or the write lands in the next
  test. Wait for figures that come from `useLiveQuery` with `waitFor`.

## Folder map

```
CLAUDE.md
docs/                 SPEC.md (verbatim brief), DECISIONS.md, CONTENT_GUIDE.md (Phase 2)
.github/workflows/    ci-deploy.yml: typecheck, lint, test, build, deploy to GitHub Pages
assets/brand/         icon.svg and icon-maskable.svg, the sources of the PNG icons
content/packs/        source packs, one JSON file per category; curriculum/ and reviews/ in Phase 2
public/               favicon.svg, icons/ (generated by `npm run icons`),
                      content/ (generated by `npm run content:build`, not in git)
scripts/              content-build.ts, content-lib.ts, generate-icons.ts; content-check in Phase 2
shared/               schema.ts (zod), ids.ts, taxonomy.ts: used by the app and by scripts
src/
  main.tsx            entry
  env.d.ts            build-time globals
  app/                App, routes, paths, Root (start-up gate), AppLayout, TabBar, Splash, PwaToasts,
                      ErrorScreen, theme, storageKeys, useContentSync, useLearningDay
  components/ui/      Screen, Button, Toast, Toggle, SegmentedControl, ComingSoon, BrandMark,
                      CategoryIcon, attributes
  components/cards/   ReadingCard (concept, formula, example, did_you_know), QuizCard, MythCard,
                      Flashcard, Formula (KaTeX), parts, useReveal
  core/               pure domain logic: config, day, srs, mixer, session, xp, character, affinity,
                      difficulty, cards, testing (helpers for tests)
  data/               db (Dexie schema), types (rows), importer, contentSync, content (index for
                      the mixer), snapshot (the mixer's input), progress (all writes), profile,
                      storage
  features/
    feed/             FeedScreen, session (controller of a feed or review session), Pager, CardPage,
                      ActionBar, FlagSheet, FeedStatus, Rewards, Checkpoint, EndPage, DoneScreen,
                      useDaily
    review/           ReviewScreen
    onboarding/       OnboardingScreen
    settings/         SettingsScreen and its pickers, AppStatus, ThemeSwitch, useSettings
    character/        CharacterScreen
    paths/, collection/   placeholders until Phases 4 and 3
  i18n/sk.ts          every Slovak UI string
  styles/             index.css (tokens, themes, base styles, layout utilities), fonts.css
  test/               setup, seed (database fixtures), packs (small content), renderApp,
                      pwaRegisterMock
```

## Deployment

GitHub Pages under the sub-path `/kvant/`, deployed by `.github/workflows/ci-deploy.yml` on every
push to `main` (Pages source: GitHub Actions). The base path is set once, as `BASE` in
`vite.config.ts`. The service worker uses the prompt strategy: a new version waits until the user
taps "Obnoviť" in the toast, so a learning session is never reloaded mid-card. The content packs
are precached with the app shell, so a pack always matches the app version that reads it.

## Phase status

- [x] **Phase 0 · Foundation.** Project skeleton, tooling, the four tabs, dark and light theme,
      Dexie schema v1, zod content schemas, PWA shell with offline support and the update
      prompt, app icon, CI workflow. **Still open:** the first deployment. The code has to be
      pushed to the `kvant` GitHub repository and Pages enabled, so the workflow has never run
      and the on-device check (install, airplane mode) is open.
- [x] **Phase 1 · Usable feed.** Content importer and `content:build`; a seed of 60 cards in
      three categories; cards for concept, formula, example, did_you_know, myth and quiz, and the
      flashcard review; the actions under a card; mixer v1 with all constraints; checkpoint,
      end page and summary of the day; onboarding; XP and character level; FSRS with reviews in
      the feed and a review session; Settings. Verified locally: 489 tests, and the built app in
      headless Chromium (two consecutive days, offline, real touch swipes, 320 to 412 px, both
      themes, 130 % and 200 % text, cold start under 1 s with 2 000 cards at a 4x CPU slowdown).
      **Still open:** a week of real use on the phone, which needs the deployment above.
- [ ] Phase 2 · Content factory
- [ ] Phase 3 · RPG and stats
- [ ] Phase 4 · Paths and bosses
- [ ] Phase 5 · Optional extras (only when asked)
