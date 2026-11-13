# Kvant — build brief for Claude Code

You are building **Kvant**, my personal micro-learning app that replaces doomscrolling. Read this whole brief before doing anything.

## 0. How we work

- **Language:** talk to me in **Slovak**. Code, identifiers, comments, commit messages and repo docs are in **English**. Every user-facing string in the app is **Slovak** and lives in `src/i18n/sk.ts`.
- **Persist this brief:** before writing any code, save this entire brief verbatim as `docs/SPEC.md`, create `CLAUDE.md` (conventions, commands, folder map, the "talk Slovak / write code in English" rule) and `docs/DECISIONS.md` (short decision log). Every future session starts by reading `CLAUDE.md` and `docs/SPEC.md`.
- **Phase by phase:** begin with a short Phase 0 plan in Slovak (max 10 bullets), then implement it. At the end of every phase: run typecheck, lint, tests and `content:check` (once it exists), commit, and give me a Slovak summary (what is done, how to try it on my phone, what comes next). Then **stop and wait until I say continue**.
- **Don't guess library APIs.** Install with npm and read the installed packages' types and docs. If anything in this brief is outdated or incompatible with current versions, choose the maintained alternative and record it in `docs/DECISIONS.md`.
- **Pure core:** all domain logic lives in `src/core` as pure TypeScript (no React, DOM or Dexie imports). Inject the clock (`now: Date`) and randomness (`rng: () => number`) so everything is deterministic and unit-testable.
- Ask me only when a decision is genuinely mine; otherwise pick a sensible default and note it in `docs/DECISIONS.md`.

## 1. Product

Kvant keeps the gesture and pace of social feeds (full-screen cards, swipe up, always something new), but every card teaches one idea from categories I choose. Quizzes on cards I have already seen are mixed in so I actually remember them. An RPG character grows with what I learn.

About me, for tone and difficulty: Slovak mechatronics student, now in the master's programme "Production Machines, Systems and Robots" at FSI VUT Brno; process-engineering intern at a hydraulics manufacturer; I want to build digital twins and lead automation projects (target: Siemens Digital Industries in Brno). I am learning German toward B2. Engineering content should sit at bachelor-to-master level.

Design principles (implement them, don't just document them):

1. **Same gesture, different content:** vertical full-screen swipe feed.
2. **Novelty in every card:** mix heavy cards (concept, formula, numeric) with light ones (example, did-you-know, myth, vocab); never more than 3 heavy cards in a row.
3. **Retrieval over re-reading:** about 30 % of feed slots are questions.
4. **Spacing and interleaving:** FSRS scheduling and mixed topics.
5. **One card, one idea:** readable in 15–60 s without scrolling.
6. **Natural endings:** a checkpoint screen after every 10 cards; reaching the daily goal is a clear "done for today", the rest is bonus.
7. **Visible progress:** every card adds XP to the character and to one attribute.

## 2. Platform and stack

- **Installable PWA**, mobile-first (Android Chrome is the main target), deployed to **GitHub Pages** under the sub-path **`/kvant/`** by GitHub Actions. Fully offline after the first load. No backend, no accounts, no analytics, no ads.
- React + Vite + TypeScript (`strict`), Tailwind CSS, Motion (framer-motion) for animation, lucide-react icons.
- Hash-based routing (GitHub Pages friendly).
- State: Zustand for UI and session state; Dexie (`dexie` + `dexie-react-hooks` `useLiveQuery`) for persistent data in IndexedDB.
- PWA: `vite-plugin-pwa` (Workbox), `registerType: 'prompt'` with a Slovak "Nová verzia, obnoviť" toast; precache the app shell and the content JSON. Create an original app icon (SVG source, generated PNG sizes).
- **Same-origin rule:** I already host another app (Obzor) on GitHub Pages, most likely on the same `<user>.github.io` origin. So: IndexedDB name `kvant`, every localStorage key prefixed `kvant:`, service-worker scope strictly `/kvant/`, manifest `scope` and `start_url` under `/kvant/`. Never read or clear any other storage.
- Call `navigator.storage.persist()` after onboarding and show the result in Settings.
- Spaced repetition: `ts-fsrs`. Validation: `zod` schemas in `shared/`, used by both the app and the scripts. Formulas: KaTeX. German pronunciation: Web Speech API (`speechSynthesis`, `de-DE`), hidden gracefully when no voice exists. Haptics: `navigator.vibrate`, a no-op where unsupported.
- Tests: Vitest, `fake-indexeddb` for data-layer tests, React Testing Library for a few key components. ESLint + Prettier. npm.
- Look and feel: dark theme by default (plus light), an accent colour per category, body text at least 18 px, respects system font scaling, works at 360 px width. Use the frontend-design skill if available; avoid a generic template look.

## 3. Repository layout

```
kvant/
├─ CLAUDE.md
├─ docs/                 SPEC.md, CONTENT_GUIDE.md, DECISIONS.md
├─ .claude/commands/     generate-pack.md, review-pack.md, fix-flagged.md
├─ content/
│  ├─ curriculum/        <categoryId>.yaml  (I edit these: what to learn)
│  ├─ packs/             <categoryId>.json  (generated cards, committed)
│  └─ reviews/           <categoryId>.md    (review reports)
├─ public/content/       manifest.json + built packs (output of content:build)
├─ scripts/              content-check.ts, content-build.ts, send-reminders.ts (Phase 3)
├─ shared/               schema.ts (zod), ids.ts, taxonomy.ts
├─ src/
│  ├─ core/              config, day, mixer, srs, xp, character, quests, achievements, difficulty
│  ├─ data/              db.ts (Dexie), repositories, importer.ts, backup.ts
│  ├─ features/          feed, review, paths, collection, character, onboarding, settings, stats
│  ├─ components/        cards/ (one component per card type), ui/
│  ├─ i18n/sk.ts
│  └─ app/               routes, layout, providers
└─ .github/workflows/    ci-deploy.yml, reminders.yml (Phase 3)
```

## 4. Taxonomy

Six domains, one per character attribute:

| Code | Attribute (Slovak) | Domain |
| --- | --- | --- |
| T | Technika | Engineering and technology |
| R | Riadenie | Production and management |
| B | Biznis | Money and business |
| M | Myseľ | Body and mind |
| W | Rozhľad | World and general knowledge |
| J | Jazyky | Languages |

Categories as `id` = Slovak name. ★ marks the starter set that gets content in Phase 2; the rest are defined in `shared/taxonomy.ts` but stay hidden in the app until a pack exists.

- **T:** ★`matematika` = Matematika pre inžinierov · ★`fyzika-mechanika` = Fyzika a mechanika · ★`robotika` = Robotika · ★`automatizacia-plc` = Automatizácia a PLC · ★`digitalne-dvojca` = Digitálne dvojča a simulácia · ★`vyrobne-stroje` = Výrobné stroje a systémy · `hydraulika-pneumatika` = Hydraulika a pneumatika · `elektrotechnika-pohony` = Elektrotechnika a pohony · `materialy-technologie` = Materiály a technológie · `programovanie-data-ai` = Programovanie, dáta a AI · `kyberbezpecnost` = Kyberbezpečnosť
- **R:** ★`lean-kvalita` = Štíhla výroba a kvalita · ★`projektovy-manazment` = Projektový manažment · `komunikacia-vedenie` = Komunikácia a vedenie ľudí
- **B:** ★`peniaze-podnikanie` = Peniaze a podnikanie · `marketing-predaj` = Marketing a predaj · `pravo-dane` = Právo a dane v praxi · `ekonomia` = Ekonómia
- **M:** ★`psychologia-mozog` = Psychológia a mozog · `vyziva-trening` = Výživa a tréning · `zdravie-prva-pomoc` = Zdravie a prvá pomoc
- **W:** ★`ako-veci-funguju` = Ako veci fungujú · `dejiny-techniky` = Dejiny techniky a sveta · `vesmir-priroda` = Vesmír a príroda · `veda-o-jedle` = Veda o jedle · `geografia-geopolitika` = Geografia a geopolitika · `filozofia-logika` = Filozofia a logika · `umenie-dizajn` = Umenie, hudba a dizajn
- **J:** ★`nemcina` = Nemčina · `technicka-anglictina` = Technická angličtina

## 5. Content

### 5.1 Card schema (`shared/schema.ts`)

Common fields:

- `id`: `<categoryId>.<topicSlug>.<cardSlug>`, stable forever. Never reuse an id for different content; a substantial rewrite gets a new id and the old card is archived.
- `topicId`, `type`, `difficulty` (1–5), `order` (integer within the topic), `title` (max 60 characters), `tags` (string[]).
- Optional `reference` (only a well-known textbook or standard), optional `volatile: true` with `validAsOf` (`YYYY-MM`) and `jurisdiction` (`SK` | `CZ` | `EU`) for facts that change.
- `recall: { q, a }` is required for every type except `quiz`, `myth` and `numeric` (those test themselves); the answer has at most 25 words.

Type-specific fields:

| Type | Slovak label | Fields | Load |
| --- | --- | --- | --- |
| `concept` | Koncept | `body` (40–90 words), `simple` (max 40 words, a layman version shown on "Nerozumiem"), optional `terms: { en?, de? }`, optional embedded `quiz` | heavy |
| `formula` | Vzorec | `latex`, `legend: [{ symbol, meaning, unit? }]`, `body` (max 60 words), `example` (one line), optional `terms` | heavy |
| `example` | Z praxe | `body` (30–80 words), optional `terms` | light |
| `did_you_know` | Vedel si? | `body` (30–80 words) | light |
| `myth` | Mýtus vs. realita | `statement`, `isTrue`, `explanation` (max 40 words) | light |
| `quiz` | Kvíz | `question`, `options` (3–4, unique), `correctIndex`, `explanation` (max 40 words) | interactive |
| `numeric` (Phase 4) | Výpočet | `question`, `answer`, `tolerance` (relative, e.g. 0.02), `unit?`, `solution` (max 60 words) | heavy |
| `vocab` | Slovíčko | `de` (nouns with article), `plural?`, `sk`, `exampleDe`, `exampleSk` | light |

Interactive cards do not count toward the heavy-in-a-row rule.

### 5.2 Pack format (`content/packs/<categoryId>.json`)

```json
{
  "schemaVersion": 1,
  "packId": "robotika",
  "packVersion": 1,
  "language": "sk",
  "category": {
    "id": "robotika",
    "name": "Robotika",
    "attribute": "T",
    "description": "Kinematika, trajektórie, koboty a bezpečnosť robotických pracovísk.",
    "color": "#4F8EF7",
    "icon": "bot",
    "defaultDifficulty": 3
  },
  "topics": [
    {
      "id": "robotika.kinematika",
      "name": "Kinematika robota",
      "order": 1,
      "prerequisites": ["matematika.matice-transformacie"],
      "description": "Priama a inverzná kinematika, DH parametre, singularity."
    }
  ],
  "cards": [
    {
      "id": "robotika.kinematika.dh-parametre",
      "topicId": "robotika.kinematika",
      "type": "concept",
      "difficulty": 3,
      "order": 4,
      "title": "Denavitove–Hartenbergove parametre",
      "body": "Polohu každého článku robota voči predchádzajúcemu opíšeš štyrmi číslami: dĺžka článku a, uhol skrútenia α, posunutie d a uhol kĺbu θ. Pri rotačnom kĺbe sa mení θ, pri posuvnom d. Vynásobením transformačných matíc všetkých kĺbov dostaneš polohu a natočenie nástroja, teda priamu kinematiku.",
      "simple": "Dohodnutý spôsob, ako štyrmi číslami opísať, ako je každý článok robota pripojený k predošlému.",
      "terms": { "en": "Denavit–Hartenberg parameters", "de": "Denavit-Hartenberg-Parameter" },
      "recall": { "q": "Ktorý DH parameter sa mení pri rotačnom kĺbe?", "a": "Uhol kĺbu θ." },
      "quiz": {
        "question": "Ktorý DH parameter je premennou posuvného kĺbu?",
        "options": ["θ (uhol kĺbu)", "d (posunutie)", "a (dĺžka článku)", "α (uhol skrútenia)"],
        "correctIndex": 1,
        "explanation": "Posuvný kĺb mení vzdialenosť pozdĺž osi z, teda posunutie d."
      },
      "tags": ["kinematika", "transformácie"]
    }
  ]
}
```

A vocab card for comparison:

```json
{
  "id": "nemcina.vyroba.spindel",
  "topicId": "nemcina.vyroba",
  "type": "vocab",
  "difficulty": 2,
  "order": 3,
  "title": "die Spindel",
  "de": "die Spindel",
  "plural": "die Spindeln",
  "sk": "vreteno",
  "exampleDe": "Die Spindel dreht sich mit 12 000 Umdrehungen pro Minute.",
  "exampleSk": "Vreteno sa otáča rýchlosťou 12 000 otáčok za minútu.",
  "recall": { "q": "Ako sa po nemecky povie „vreteno“ (aj s členom)?", "a": "die Spindel" },
  "tags": ["výroba", "stroje"]
}
```

### 5.3 Curriculum (`content/curriculum/<categoryId>.yaml`), the source of truth I edit

```yaml
category: robotika
name: Robotika
attribute: T
defaultDifficulty: 3
topics:
  - slug: kinematika
    name: Kinematika robota
    prerequisites: [matematika.matice-transformacie]
    objectives:
      - priama a inverzná kinematika
      - Denavitove–Hartenbergove parametre
      - singularity
    cards: 10
```

### 5.4 Pipeline

1. **`/generate-pack <categoryId>`** (a project command in `.claude/commands/`, or a project skill if that is what your version prefers): read the curriculum, `docs/CONTENT_GUIDE.md` and the existing pack; generate only the missing cards, respecting target counts and the format mix; write the pack; run `npm run content:check` and fix until clean; bump `packVersion`; print a Slovak summary. One category per session is fine.
2. **`/review-pack <categoryId>`**, meant for a fresh session without the generation context (tell me when to open one): act as a strict reviewer of facts, quiz ambiguity (exactly one correct option), length limits, natural Slovak and correct terminology, difficulty labels and invented references. Fix in place and write `content/reviews/<categoryId>.md` listing what changed.
3. **`/fix-flagged <file>`**: read the JSON export of cards I flagged in the app (with my notes) and fix or remove them.
4. **`npm run content:check`** fails on: schema errors; duplicate ids across packs; unresolved or cyclic prerequisites; `correctIndex` out of range or duplicate options; word and character limits; missing `recall`; `volatile` without `validAsOf`; LaTeX that KaTeX cannot parse. It warns on: near-duplicate titles (trigram similarity above 0.8); one `correctIndex` used for more than 40 % of a pack's quizzes; a format mix far from target.
5. **`npm run content:build`** validates, adds a `contentHash` to every card, and writes `public/content/packs/*.json` and `public/content/manifest.json` (`[{ packId, packVersion, hash, cardCount }]`).
6. **In the app**, the importer reads the manifest on start (and whenever online), downloads changed packs, and upserts categories, topics and cards in one transaction. Cards that disappeared are archived. It **never touches user state**. A flagged card whose `contentHash` changed is unflagged automatically.

### 5.5 `docs/CONTENT_GUIDE.md` (write it in Phase 2) must say

- Slovak (sk-SK), natural and concise, never sounding translated; correct Slovak technical terms; English and German equivalents in `terms` for technical concepts (German nouns with article).
- One idea per card, a concrete example or analogy, SI units, no filler.
- Difficulty rubric: 1 general public or secondary school · 2 first-year university · 3 bachelor engineering · 4 master's level or practising engineer · 5 specialist detail.
- Format mix per topic: about 50 % concept or formula, 25 % light (example, did_you_know, myth), 25 % quiz. Nemčina: mostly vocab plus short grammar concept cards.
- Quizzes: exactly one correct option, plausible distractors of similar length, an explanation of why the right answer is right; spread `correctIndex` evenly.
- Never invent sources, URLs, statistics or quotes. `reference` only for well-known standards or textbooks you are certain of; otherwise leave it out.
- Time-sensitive facts (laws, tax rates, prices, rankings) carry `volatile`, `validAsOf` and `jurisdiction`.
- Health and nutrition: mainstream, evidence-based and conservative; no dosing or medical advice. Nothing that teaches dangerous procedures.

## 6. Data model (Dexie, database `kvant`, versioned migrations)

| Table | Contents |
| --- | --- |
| `categories`, `topics`, `cards` | Content from packs; `cards.archived` for removed cards |
| `contentMeta` | `packId`, `version`, `hash`, `importedAt` |
| `cardState` | `cardId`, `firstSeenAt`, `lastSeenAt`, `seenCount`, `liked`, `bookmarked`, `known`, `flagged { at, note }`, `srs` (serialised ts-fsrs card), `masteredAt` |
| `reviewLog` | `++id`, `cardId`, `ts`, `rating`, `mode` (feed, review, boss), `responseMs` |
| `events` | `++id`, `ts`, `learningDay`, `type`, `cardId?`, `payload` |
| `daily` | `learningDay`, `cardsSeen`, `newCards`, `answers`, `correct`, `xp`, `activeSeconds`, `goalMet`, `quests` |
| `character` | `id: 'me'`, `name`, `totalXp`, `attributeXp { T, R, B, M, W, J }`, `createdAt` |
| `topicAffinity`, `categoryDifficulty` | Mixer inputs (section 8) |
| `settings` | `id: 'me'`, `categoryWeights`, `dailyGoal`, `newCardCap`, `desiredRetention`, `serendipity`, `streakEnabled`, `showGermanTerms`, `theme`, `reminders` |
| `achievements`, `pathProgress` | Unlocks with progress; path chapter and boss attempts |

- Active time counts only while the feed or review screen is visible (Page Visibility API), capped at 90 s per card.
- Backup: export everything except the content tables into one JSON file (Web Share API or download); import with schema validation and a confirmation dialog.

## 7. Learning day

A learning day runs from **04:00 to 04:00 local time** (`DAY_START_HOUR = 4`), so learning after midnight counts toward the previous day. All daily logic goes through `learningDay(now)` in `src/core/day.ts`. Test DST transitions for Europe/Prague.

## 8. Feed mixer (`src/core/mixer.ts`, constants in `src/core/config.ts`)

- Batches of `BATCH_SIZE = 10`: 6 new, 3 retrieval, 1 serendipity. With more than 30 due reviews, retrieval grows to 5 and new shrinks.
- **New slot:** choose a category by weighted random, `weight = userWeight (0–100) × mean affinity of its unlocked topics`. A topic unlocks when at least 50 % of the cards in each prerequisite topic have been seen. Choose a topic among unlocked ones by affinity, preferring topics already in progress. Choose the next unseen card by `order`, preferring difficulty within ±1 of the category's adaptive target.
- **Retrieval slot:** the most overdue due card (FSRS `due ≤ now`), preferring a category different from the previous card and attributes whose sharpness is below 70 %. If none is due: a quiz from cards seen in the last 72 h and not tested today. If none: fall back to a new card.
- **Serendipity slot:** a light card with difficulty ≤ 2 from a category I have not selected (setting, default on).
- **Constraints:** at most 2 cards in a row from one category; at most 3 heavy cards in a row; never the same topic twice in a row (except inside the "Hlbšie" carousel); daily new-card cap `NEW_CARD_CAP = 40` (setting).
- **Topic affinity** starts at 1.0: like +0.15, bookmark +0.10, "Už viem" −0.05, skipping a non-interactive card within 2 s −0.03; clamp to 0.5–2.0.
- **Adaptive difficulty** per category: the target starts at the category's `defaultDifficulty`; the window is the last 20 graded answers in that category; adjust only with at least 8 answers and at most once per 10 answers; accuracy above 0.85 gives +1, below 0.60 gives −1; clamp to 1–5.
- **"Nerozumiem":** show the card's `simple` text inline, bring the card back at least 5 cards later in the same session, and prefer an easier card from the same topic next.
- **"Hlbšie":** open a horizontal carousel with the next 3 cards of the same topic.
- The mixer is a pure function `(stateSnapshot, now, rng) → Card[]`. Build the next batch when I am 3 cards from the end.
- Paths (Phase 4) and the feed write to the same card states.

## 9. Spaced repetition (`src/core/srs.ts`)

- `ts-fsrs` with `request_retention` 0.9 (setting 0.85–0.95), `maximum_interval` 365, fuzz on.
- First exposure is **not** a review: create the SRS record due at the start of the next learning day.
- "Už viem" on first sight applies `Easy`.
- Grades: wrong quiz answer → `Again`; correct but slower than 20 s → `Hard`; correct → `Good`. Flashcard buttons Nevedel / Ťažké / Vedel / Ľahké → `Again` / `Hard` / `Good` / `Easy`.
- A review shows the card's own quiz if it has one, otherwise a flashcard (`recall.q`, tap, `recall.a` plus grade buttons).
- Mastered: state Review and stability ≥ 21 days sets `masteredAt`; once set, the card stays in the Collection.
- Sharpness (Ostrosť) of an attribute = mean current retrievability of its cards with at least one review, shown as 0–100 %.

## 10. Game layer (`src/core/xp.ts`, `character.ts`, `quests.ts`, `achievements.ts`)

- **XP:** new card read (dwell ≥ 3 s or any action) +5; correct answer +10; wrong answer +2; from the 3rd correct answer in a row, answer XP ×1.5 until a miss; daily goal +50; each daily quest +25 and all three +50 bonus; boss win +150. XP goes to `totalXp` and to the card's attribute.
- **Levels:** XP from character level n to n+1 = `round(60 * n ** 1.5)`; attribute levels use `round(30 * n ** 1.5)`. A typical 20-card day is about 300 XP, so level 10 comes after roughly 3 weeks and level 20 after 4–5 months.
- **Rank:** levels 1–4 Nováčik, 5–9 Učeň, 10–19 Tovariš, 20–34 Majster, 35–49 Veľmajster, 50+ Legenda.
- **Class** (from character level 5, before that "Tulák"): sort attributes by XP. If the top attribute holds less than 25 % of all attribute XP → Polyhistor. Else if top ≥ 2 × second → a single class: T Konštruktér, R Organizátor, B Obchodník, M Stoik, W Bádateľ, J Polyglot. Otherwise a pair class from the top two: T+R Projektový inžinier, T+B Inžinier-podnikateľ, T+M Kyborg, T+W Vynálezca, T+J Globálny integrátor, R+B Riaditeľ závodu, R+M Kouč, R+W Stratég, R+J Diplomat, B+M Investor, B+W Kupec, B+J Exportér, M+W Filozof, M+J Básnik, W+J Cestovateľ.
- **Sharpness bar** on each attribute; below 70 % the attribute shows a "rusting" state, mentioned at the checkpoint.
- **Daily quests:** 3 per learning day, chosen deterministically from (day, state) out of these templates: answer 8 correctly; review 10 due cards; read 5 cards from the attribute I trained least this week; sharpen the dullest attribute above 85 %; 3 correct in a row; open a category I have never tried.
- **Collection rarity** by difficulty: 1 bežná, 2 neobvyklá, 3 vzácna, 4 epická, 5 legendárna.
- **Achievements** (initial set): first card; 100 and 1 000 cards; 20 correct in a row (Bez chyby); learning before 7:00 (Ranné vtáča); after 23:00 (Nočná sova); cards from 10 categories (Polyhistor); 50 mastered cards (Zberateľ); first boss (Premožiteľ); 100 reviews; 7 days with the goal met, not necessarily consecutive.
- **Optional day streak** (setting, default **off**): counts learning days with the goal met; one freeze earned per 7 days, max 2, used automatically.
- **Feedback:** vibration on answers, floating "+XP", confetti on level-up and goal; sound off by default; respect reduced motion.
- **Guardrails:** checkpoint every 10 cards; at most 3 reminders a day; no guilt-tripping copy anywhere.

## 11. Screens (all text in Slovak)

- **Onboarding:** character name → pick categories grouped by attribute (starter set preselected) → weight sliders → daily goal 10 / 20 / 40 → finish and request persistent storage.
- **Feed:** full-screen vertical snap pager with only about 7 cards in the DOM. Header: daily-goal ring, character level, number of due reviews (tap to start a review session). Footer actions: Viac takého, Uložiť, Už viem, Nerozumiem, Hlbšie, Chyba (with an optional note). Category colour on every card; KaTeX on formula cards; a speaker button on vocab cards.
- **Checkpoint** after each batch: XP gained, new concepts, accuracy, quest progress, rusting attributes; buttons "Pokračovať" and "Na dnes stačí" (opens a calm summary screen).
- **Review session:** due cards only, quiz or flashcard, ends with a summary.
- **Cesty** (Phase 4): one path per category; chapters are its topics in prerequisite order, drawn as a skill-tree map with locked, unlocked and completed nodes; every chapter ends with a boss (10 questions from the topic, at least 80 % to win, retry after 1 hour).
- **Zbierka:** mastered cards by rarity, bookmarks, search, completion per category.
- **Postava:** avatar emblem, level, rank, class, 6 attributes with level and sharpness, today's quests, achievements, stats (12-week heatmap, cards per day, accuracy, minutes learned this week "namiesto scrollovania").
- **Nastavenia:** categories and weights, daily goal, new-card cap, retention, serendipity, German terms, streak, reminders, theme, backup and restore, flagged-card export, storage status, app version.

## 12. Phases and acceptance criteria

Stop after each phase and wait for me.

**Phase 0 · Foundation.** Vite + React + TypeScript strict, Tailwind, ESLint and Prettier, Vitest, hash router with the four tabs (Feed, Cesty, Zbierka, Postava) and placeholder screens, PWA manifest and service worker scoped to `/kvant/`, Dexie schema v1, zod schema in `shared/`, `CLAUDE.md`, `docs/SPEC.md`, `docs/DECISIONS.md`, and a GitHub Actions workflow (typecheck, lint, test, build, deploy to Pages). Tell me step by step how to create the repo and enable GitHub Pages. *Done when:* the empty app opens from GitHub Pages on my Android phone, installs to the home screen, opens in airplane mode, and CI is green.

**Phase 1 · Usable feed.** Content importer; a seed pack you write yourself (no API): 60 cards across `fyzika-mechanika`, `robotika` and `ako-veci-funguju`, 2 topics each, covering every Phase 1 card type; card components (concept, formula, example, did_you_know, myth, quiz, flashcard review); card actions; mixer v1 with all constraints; checkpoint; onboarding; XP and character level; FSRS scheduling with reviews inside the feed. *Done when:* I can learn every day for a week without bugs, and unit tests cover mixer constraints, FSRS grade mapping, XP and levels, and learning-day boundaries.

**Phase 2 · Content factory.** `docs/CONTENT_GUIDE.md`; curriculum YAMLs for the 12 starter categories (5 topics × 10 cards each; Nemčina 100 vocab cards); the three Claude Code commands; `content:check`; `content:build`; vocab cards with pronunciation. Then generate and review all starter packs, one category at a time. *Done when:* about 650 reviewed cards are live and `content:check` reports no errors.

**Phase 3 · RPG and stats.** Attributes, sharpness, classes, ranks, quests, collection, achievements, stats, backup and restore, flagged-card export, optional streak. Reminders via Web Push: a subscription screen in Settings (VAPID); a scheduled GitHub Actions workflow running `scripts/send-reminders.ts` with `web-push` (VAPID keys and my subscription stored as repository secrets) that sends up to 3 pushes a day at times I configure; the service worker composes each notification itself from IndexedDB (a real recall question from a due card, or a teaser of the next new card), skips it when today's goal is met, and opens that card on tap. Document the limits of GitHub's scheduler (runs can be delayed; scheduled workflows pause after long repository inactivity). *Done when:* the Postava screen is complete and a test reminder arrives on my phone.

**Phase 4 · Paths and bosses.** Skill-tree paths, chapters, bosses, adaptive difficulty visible in the UI, numeric cards, the "Hlbšie" carousel. *Done when:* I can finish a whole path including its last boss.

**Phase 5 · Optional extras (only when I ask).** The Anthropic API with my own key stored locally (entered in Settings, never logged or committed, with a warning that it lives in browser storage): "Vysvetli inak" (a fast model such as `claude-haiku-5-5`), "Ponor sa hlbšie" generating 3 new cards, and "Karty z PDF" turning my lecture PDFs into a pack (a stronger model such as `claude-sonnet-5-5`); use newer models if they exist. Validate every generated card with the same zod schema and mark it `aiGenerated`. Read the current docs at docs.claude.com before implementing (browser access, PDF input, structured output). Later: a Capacitor Android wrapper for exact local notifications and a "karta dňa" home-screen widget, loading packs from the Pages URL.

## 13. Quality bar

- TypeScript strict; no `any` in `src/core` or `shared/`.
- Unit tests for every module in `src/core` and for `content-check`.
- Performance: smooth swiping on a mid-range Android phone; cold start under 2 s with 2 000 cards; never load all cards into React state, query by index.
- Accessibility: labels on icon buttons, visible focus, reduced-motion support, AA contrast.
- No network requests outside the app's own origin (plus the Anthropic API in Phase 5).

**Start now:** save this brief as `docs/SPEC.md`, then give me your Phase 0 plan in Slovak and implement Phase 0.
