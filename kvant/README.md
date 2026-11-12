# Kvant

A personal micro-learning app that replaces doomscrolling. It keeps the gesture of a social feed
(full-screen cards, swipe up, always something new), but every card teaches one idea. Quizzes on
cards already seen are mixed in so the ideas stick, and an RPG character grows with what is
learned. The app is in Slovak.

Kvant is an installable PWA that works offline, with no backend, no accounts and no analytics. It
is deployed to GitHub Pages under `/kvant/`.

## Where it stands

The feed is usable (Phase 1 of the brief): onboarding, a seed of 60 cards on mechanics, robotics
and how things work, six kinds of cards, quizzes and flashcard reviews spaced with FSRS, a
checkpoint after every ten cards, experience points and a character level. The content factory,
the full character sheet, paths and bosses follow in later phases.

## Development

Needs Node 22.22 or newer.

```sh
npm ci
npm run dev        # http://localhost:5173/kvant/
npm run check      # typecheck, lint, tests
npm run build      # production build into dist/
npm run preview    # serve the build, with the service worker, at http://localhost:4173/kvant/
```

Cards live in `content/packs/`, one JSON file per category. `npm run content:build` validates
them and writes the files the app loads into `public/content/`. It runs by itself before `dev`
and `build`.

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md): the build brief and source of truth
- [`docs/DECISIONS.md`](docs/DECISIONS.md): where the code refines or deviates from the brief
- [`CLAUDE.md`](CLAUDE.md): conventions, commands and the folder map
