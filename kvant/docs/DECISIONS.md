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
  (Sizes after Phase 1 are listed there.)

### PWA

- **vite-plugin-pwa 2, `generateSW`, `registerType: 'prompt'`.** The whole app shell is precached.
  `clientsClaim` is on and `skipWaiting` only runs when the user taps "Obnoviť". Without
  `clientsClaim` the first visit stays uncontrolled, and an update arriving during it activated
  at once while the toast still offered a reload that did nothing.
- **Update checks also run when the app returns to the foreground**, at most once an hour. An
  installed app can stay in memory for days, and the browser only checks on a page load.
- **`workbox.cacheId: 'kvant'`** prefixes every cache name (same-origin rule).
- **Content JSON was not precached in Phase 0**, when there were no packs. Phase 1 precaches it,
  see below.
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
- **The tab bar is capped against font scaling.** Four labels share the width, so label, icon
  and height are limited relative to the viewport. Phase 1 applies the same idea to a few more
  places, see "Layout" there.
- **The theme is stored in localStorage (`kvant:theme`), not in the Dexie `settings` row.** An
  inline script in `index.html` must read it before the first paint, and IndexedDB is
  asynchronous. `SettingsRow.theme` stays in the type so a backup can carry the theme later.
- **The theme switch sat on the Postava placeholder** in Phase 0. It is in Settings now.

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

## Phase 1 · Usable feed (2026-11-12)

### Scope

- **Built now although the brief lists it later:** a minimal `content:build` (the importer needs
  built packs with hashes and a manifest; `content:check` and the curriculum stay in Phase 2),
  and a Settings screen with what Phase 1 already has to offer: name, daily goal, categories and
  weights, new-card cap, retention, serendipity, German terms, theme, storage status, version.
  Streak, reminders, backup and the flagged-card export come with their phases.
- **Left for their own phases:** the "Hlbšie" action and numeric cards (Phase 4), vocab cards
  (Phase 2), and of the feedback in section 10 the confetti, which comes with the game layer in
  Phase 3. A new level is celebrated with a plain overlay for now.
- **The Postava screen shows** level, rank, XP and the six attribute levels. Class, sharpness,
  quests, achievements and statistics are Phase 3.

### Spaced repetition

- **ts-fsrs 5.4, not 6.** Version 6 requires Node 24 and the build runs on Node 22. The stored
  record (`SrsRecord`) is Kvant's own shape, so the upgrade will not touch the database.
- **Scheduling works in whole days** (`enable_short_term: false`). There are no learning steps
  of minutes: every rating leads to an interval of at least one day, and `Again` brings the card
  back the next learning day. A feed has no "in ten minutes".
- **A card is due for a whole learning day.** `due` is the 04:00 that starts the day, counted in
  learning days from the day of the review. That keeps daylight-saving changes and the time of
  day of a review out of the schedule, and it is what makes "Zajtra čaká N opakovaní" exact.
- **The interval is clamped to 365 days after ts-fsrs.** It keeps Hard < Good < Easy even at the
  cap and can report 366 or 367.
- **An answer on a card's first showing is not a rating.** The brief says a first exposure is
  not a review, and a quiz or myth card is answered the moment it is first shown. Such an answer
  earns XP and counts for accuracy and adaptive difficulty, but the schedule starts unrated. The
  first rating comes from the first retrieval.
- **A quiz on a recently seen card (the "recent" retrieval) is rated**, like a due review. It
  is a real retrieval, a few cards or a day after the reading.
- **At most one rating per card per learning day**, enforced in `recordAnswer`. Whole-day
  scheduling has no meaning for a second rating on the same day, and the feed and a review
  session can both hold the same card. The second answer is practice: XP, no rating.
- **"Už viem" applies Easy only to a card that was never rated.** On a rated card it only sets
  the flag and lowers the affinity.
- **Mastered** needs the Review state and a stability of 21 days, and `masteredAt` is never
  cleared, as the brief says. Sharpness is computed but not shown before Phase 3.

### Mixer

- **When the order rules cannot all hold, they are given up one at a time** rather than ending
  the feed: first the limit of two cards per category, then "never the same topic twice", and
  the limit of three heavy cards last. This only happens with a single selected category, or in
  the first minutes of the first day, when every topic opens with a concept and nothing is due.
  A stricter reading of the rules always wins over the preferred kind of card: a review that
  obeys them is served before a new card that breaks them.
- **A serendipity card closes every fallback chain.** One extra card from an unselected category
  is a smaller departure than breaking an order rule.
- **A prerequisite does not block** when its topic is not in the content, has no cards, or
  belongs to a category the reader did not select. Otherwise a topic could stay locked for ever.
- **"Preferring topics already in progress" is a weight of 3.**
- **The daily cap counts cards that are queued**, not only those already shown, and the card on
  screen is treated as queued. Otherwise the cap overshoots by a batch, and a quiz the reader is
  looking at could come back as a "recent" retrieval a few cards later.
- **A retrieval counts as an interactive card for the order rules**, whatever the card's type.
- **Seed content alternates heavy and light cards within a topic.** With six topics that all
  open with three concepts, the heavy-card rule cannot be met on day one.

### Session

- **Seen, read, counted.** Seen: shown, which creates the state and the schedule and counts
  toward the cap (`daily.newCards`). Read: 3 s on screen or any action, which is what the brief's
  XP rule says. Counted: read or answered, toward the daily goal (`daily.cardsSeen`). New cards
  that were read are counted on their own (`daily.newCardsRead`), so the summary of the day can
  say "of which new" truthfully when some new cards were swiped past.
- **An unanswered quiz or myth is not a quick skip.** The brief exempts interactive cards. A
  myth is "light" for the order rules, but on its first showing it is a question.
- **Taking a flag back is not an action** that makes a card count as read.
- **The daily-goal bonus goes to the total XP only**, not to an attribute: it belongs to the
  day, not to a card.
- **A feed session belongs to one learning day.** It keeps its queue and its place while the
  reader visits other tabs, and starts over when it is shown again on another day. A phone keeps
  the app in memory overnight, and yesterday's queue holds none of today's due reviews.
- **Settings that change the mix start the feed over** (categories, weights, new-card cap,
  serendipity). The cards already queued were mixed with the old values.
- **A retrieval that is waiting in the queue is dropped once its card has been answered**, in
  the feed or in a review session that got to it first.
- **A review session takes 20 due cards**, most overdue first, and offers another set while more
  are due. An open-ended queue is not a set one can finish.
- **A repeat after "Nerozumiem"** goes to the first place at least five cards on that breaks no
  order rule. If there is none yet it joins the next batch.
- **Active time** is the time a card is on screen while the app is visible, at most 90 s per
  card over all its showings.

### Content and import

- **Built packs are generated, not committed.** `content:build` writes `public/content/` (in
  `.gitignore`) before `dev` and `build`. The sources in `content/packs/` are the only copy.
- **Built packs and the manifest are precached with the app shell.** A pack therefore always
  matches the app version that reads it, the first start needs one online visit, and a content
  update arrives with the next app update. The importer reads the manifest on every start and
  loads only packs whose hash changed.
- **`contentHash` is the first 16 hex digits of the SHA-256 of the card's canonical JSON** (keys
  sorted, no whitespace). The pack hash in the manifest covers the whole built pack.
- **A legend `symbol` is LaTeX**, like the formula itself, so that `\vec{F}` or `\Delta t` in
  the legend looks the same as in the formula.
- **Cards that leave a pack are archived, not deleted**, and a pack that leaves the manifest
  archives all its cards. A flag is cleared when the content of its card changes, as the brief
  asks. Nothing else the importer does touches user state.
- **A broken pack does not stop the import.** It is reported and skipped, and what was stored
  before stays. Only an unreadable manifest fails, and then only a first start shows an error.

### Data model

- **Three row fields beyond the brief's table:** `cardState.lastAnsweredAt` (decides "not tested
  today" for recent retrievals), `daily.correctStreak` (the XP multiplier survives a reload) and
  `daily.newCardsRead` (above). None is a key or an index, so the schema version stays 1.
- **`reviewLog` holds ratings only.** An answer on a first showing is in `events`, not there.
- **All progress writes go through `src/data/progress.ts`**, each as one transaction over every
  table it touches, so a card is never half recorded.
- **The mixer's input is a snapshot** (`buildSnapshot`): all card states, but of the content only
  a text-free index that is built once per content version.

### Layout

- **Body text follows the system font without limit. What must fit side by side does not grow
  with it:** the top row of a card (category name, daily ring, level, due reviews), the side
  gutters, the action bar, and every text size above the body size, all capped against the
  screen width. At 200 % the status corner used to cover the category name and a title held one
  word per line. The caps sit above the default sizes on a 360 px screen, so they only bite once
  the font is enlarged.
- **Touch targets in a row are 48 px in pixels**, not in rem.
- **A card longer than the screen scrolls inside its own area** and fades out at the lower edge.
  At the default font size on a 360 x 740 screen most seed cards fit. Formula cards with a long
  text and the longest concept run over by one or two lines. What a tap reveals is scrolled into
  view.
- **The category name is in sentence case and may take two lines.** Names run to 28 letters, and
  in capitals with letter-spacing most of them were cut off beside the status corner.
- **KaTeX is a lazy chunk** of its own with woff2 fonts only (the woff and ttf sources are
  dropped at build time), and its display margin is trimmed inside a formula block. Until the
  chunk arrives, a formula card shows the LaTeX source.

### Pager

- **Native scroll snapping** (`snap-mandatory`, `snap-always`), one page per swipe, with about
  seven pages rendered around the current one.
- **The current page is the one the scroll comes to rest on**, taken from `scrollend`. Where a
  browser lacks that event, a pause of 120 ms in the scroll events stands in.
- **The page height is read as a fraction** (`getBoundingClientRect`), not from `clientHeight`,
  which is rounded: on a screen whose pages are a third of a pixel short, the error grows with
  every page.

### Sizes

- JavaScript, gzipped: app 31 kB, React 68, Motion 47, vendor 99 (Dexie, React Router, zod,
  ts-fsrs, lucide, Zustand), and KaTeX 78, which loads with the first formula card. The precache
  has 42 entries and 1.6 MB, of which the fonts are 0.4 MB.

### Verification

- **Browser checks are scripts run by hand, not part of the repository or CI.** They use the
  Playwright that the build environment happens to have. The brief names Vitest and Testing
  Library only, and jsdom covers the logic. What it cannot cover (layout, scrolling, touch,
  the service worker) was checked in headless Chromium against `npm run preview`.
- **Tests fake `Date`, `setTimeout` and `clearTimeout` only.** fake-indexeddb schedules its work
  on real macrotasks.
- **`npm audit`** is unchanged from Phase 0: build-time tooling only.
