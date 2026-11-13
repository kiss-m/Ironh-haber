/**
 * A learning session: the queue of cards on screen, what the reader did on each of them, and
 * the bookkeeping that follows from it.
 *
 * There are two sessions. The feed mixes new cards with retrievals and grows batch by batch.
 * The review session holds due cards only and ends with a summary. Both show the same cards in
 * the same pager, so they share this code.
 *
 * The store holds only what the screen renders. Timers and per-visit counters live outside it.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { isAnsweredOnSight, quizOf } from '../../core/cards.ts';
import {
  ACTIVE_SECONDS_CAP,
  BATCH_SIZE,
  QUICK_SKIP_MS,
  READ_DWELL_MS,
  REVIEW_SESSION_SIZE,
} from '../../core/config.ts';
import { learningDay, learningDayStart, type LearningDay } from '../../core/day.ts';
import {
  buildBatch,
  buildReviewQueue,
  entryLoad,
  isFirstReading,
  isRetrieval,
  type FeedEntry,
  type FeedStep,
} from '../../core/mixer.ts';
import {
  needsNextBatch,
  placeRepeats,
  scheduleRepeat,
  toPages,
  type FeedPage,
  type PendingRepeat,
} from '../../core/session.ts';
import {
  gradeForAnswer,
  gradeForFlashcard,
  isCorrectGrade,
  type FlashcardButton,
  type Grade,
} from '../../core/srs.ts';
import { loadContentIndex } from '../../data/content.ts';
import { db } from '../../data/db.ts';
import {
  addActiveSeconds,
  markKnown,
  recordAnswer,
  recordNotUnderstood,
  recordQuickSkip,
  recordRead,
  recordSeen,
  setBookmarked,
  setFlag,
  setLiked,
  type Reward,
} from '../../data/progress.ts';
import { buildSnapshot } from '../../data/snapshot.ts';

export type SessionKind = 'feed' | 'review';

/** What the reader did on one card of the queue. */
export interface PageState {
  /** Quiz: the option that was picked. */
  choice: number | null;
  /** Myth: the reader's verdict, true for "Pravda". */
  verdict: boolean | null;
  /** Flashcard: the answer is showing. */
  revealed: boolean;
  /** Flashcard: the grade that was given. */
  grade: FlashcardButton | null;
  /** Whether the answer was right. Null while the card is unanswered. */
  correct: boolean | null;
  /** "Nerozumiem" was tapped during this showing. */
  notUnderstood: boolean;
}

export const EMPTY_PAGE: PageState = {
  choice: null,
  verdict: null,
  revealed: false,
  grade: null,
  correct: null,
  notUnderstood: false,
};

/** The numbers a checkpoint or a summary shows for one stretch of cards. */
export interface StretchStats {
  /** Cards that counted toward the daily goal. */
  cards: number;
  xp: number;
  answers: number;
  correct: number;
  /** Titles of the new cards read in this stretch. */
  newTitles: string[];
  /** The daily goal was reached during this stretch. */
  goalReached: boolean;
}

function emptyStats(): StretchStats {
  return { cards: 0, xp: 0, answers: 0, correct: 0, newTitles: [], goalReached: false };
}

export interface SessionState {
  status: 'idle' | 'loading' | 'ready';
  entries: FeedEntry[];
  /** Nothing more will be added to the queue. */
  exhausted: boolean;
  /** The page on screen, counting checkpoints. */
  pageIndex: number;
  /** State per entry of the queue, by its index. */
  pages: Record<number, PageState>;
  /** Feed: one item per batch of ten. Review: a single item for the whole session. */
  stats: StretchStats[];
  /** The latest XP gain, shown as a floating "+XP". The id changes with every gain. */
  reward: { id: number; xp: number } | null;
  /** A level that was just reached, until the celebration is dismissed. */
  levelUp: number | null;
}

const INITIAL: SessionState = {
  status: 'idle',
  entries: [],
  exhausted: false,
  pageIndex: 0,
  pages: {},
  stats: [],
  reward: null,
  levelUp: null,
};

/** Per-visit facts that nothing renders: timing and what has already been credited. */
interface Visit {
  /** Milliseconds the card has been visible, summed over every time it was on screen. */
  visibleMs: number;
  /** When the card became visible this time, or null while it is not on screen. */
  visibleSince: number | null;
  /** Visible time already added to the day's active seconds. */
  bookedMs: number;
  /** The card was recorded as seen. */
  seen: boolean;
  /** The card went toward the daily goal. */
  counted: boolean;
  /** The reader did something on the card other than leaving it. */
  acted: boolean;
  /** Flashcard: how long the reader took to ask for the answer. */
  revealedAfterMs: number | null;
  readTimer: ReturnType<typeof setTimeout> | null;
}

export interface Session {
  kind: SessionKind;
  useStore: UseBoundStore<StoreApi<SessionState>>;
  /** The pages of the queue: cards, checkpoints and the closing page. */
  pages: (state: SessionState) => FeedPage[];
  /** Starts the session, or continues it, when its screen appears. */
  attach: () => void;
  /** Pauses the session when its screen goes away. */
  detach: () => void;
  /** The reader moved to another page. */
  setPage: (pageIndex: number) => void;
  answerQuiz: (entryIndex: number, choice: number) => Promise<void>;
  answerMyth: (entryIndex: number, verdict: boolean) => Promise<void>;
  reveal: (entryIndex: number) => void;
  gradeFlashcard: (entryIndex: number, grade: FlashcardButton) => Promise<void>;
  like: (entryIndex: number, liked: boolean) => Promise<void>;
  bookmark: (entryIndex: number, bookmarked: boolean) => Promise<void>;
  known: (entryIndex: number) => Promise<void>;
  notUnderstood: (entryIndex: number) => Promise<void>;
  flag: (entryIndex: number, note: string | null) => Promise<void>;
  dismissLevelUp: () => void;
  /** Forgets the session. The next attach starts a new one. */
  reset: () => void;
}

function vibrate(pattern: number | number[]): void {
  // Not every browser has the Vibration API, and it does nothing on desktop.
  if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
}

export function createSession(kind: SessionKind): Session {
  const useStore = create<SessionState>(() => ({ ...INITIAL }));
  const { getState: get, setState: set } = useStore;

  let visits = new Map<number, Visit>();
  let repeats: PendingRepeat[] = [];
  let easier: Record<string, number> = {};
  /** The highest entry index that was ever on screen. Everything after it is still pending. */
  let furthest = -1;
  let attached = false;
  let extending: Promise<void> | null = null;
  let rewardId = 0;
  /** The learning day the queue was started on. A queue does not carry over into the next day. */
  let startedOn: LearningDay | null = null;
  /** Bumped by reset(), so that work started before a reset does not write into the new session. */
  let generation = 0;

  const pages = (state: SessionState): FeedPage[] =>
    kind === 'feed'
      ? toPages(state.entries, state.exhausted)
      : [
          ...state.entries.map((entry, entryIndex): FeedPage => ({
            kind: 'card',
            entry,
            entryIndex,
          })),
          { kind: 'end' },
        ];

  const stretchOf = (entryIndex: number): number =>
    kind === 'feed' ? Math.floor(entryIndex / BATCH_SIZE) : 0;

  function visitOf(entryIndex: number): Visit {
    let visit = visits.get(entryIndex);
    if (!visit) {
      visit = {
        visibleMs: 0,
        visibleSince: null,
        bookedMs: 0,
        seen: false,
        counted: false,
        acted: false,
        revealedAfterMs: null,
        readTimer: null,
      };
      visits.set(entryIndex, visit);
    }
    return visit;
  }

  function visibleTime(visit: Visit): number {
    return visit.visibleMs + (visit.visibleSince === null ? 0 : Date.now() - visit.visibleSince);
  }

  function patchPage(entryIndex: number, patch: Partial<PageState>): void {
    set((state) => ({
      pages: {
        ...state.pages,
        [entryIndex]: { ...(state.pages[entryIndex] ?? EMPTY_PAGE), ...patch },
      },
    }));
  }

  function patchStats(entryIndex: number, change: (stats: StretchStats) => void): void {
    set((state) => {
      const index = stretchOf(entryIndex);
      const stats = [...state.stats];
      while (stats.length <= index) stats.push(emptyStats());
      const next = { ...(stats[index] ?? emptyStats()) };
      next.newTitles = [...next.newTitles];
      change(next);
      stats[index] = next;
      return { stats };
    });
  }

  /** Shows what an action earned and adds it to the numbers of its stretch. */
  function applyReward(entryIndex: number, reward: Reward, counted: boolean): void {
    patchStats(entryIndex, (stats) => {
      stats.xp += reward.xp;
      if (counted) stats.cards += 1;
      if (reward.goalReached) stats.goalReached = true;
    });
    if (reward.xp > 0) {
      rewardId += 1;
      set({ reward: { id: rewardId, xp: reward.xp } });
    }
    if (reward.leveledUp) {
      set({ levelUp: reward.level });
      vibrate([40, 60, 40, 60, 120]);
    }
  }

  async function titleOf(cardId: string): Promise<string | undefined> {
    return (await db.cards.get(cardId))?.title;
  }

  /** Counts a card as read: once per showing, and only for readings, not for retrievals. */
  async function creditRead(entryIndex: number): Promise<void> {
    const startedIn = generation;
    const entry = get().entries[entryIndex];
    const visit = visitOf(entryIndex);
    if (!entry || visit.counted || isRetrieval(entry.source)) return;
    visit.counted = true;
    const newCard = isFirstReading(entry.source);
    const reward = await recordRead(db, entry.cardId, new Date(), { newCard });
    if (startedIn !== generation) return;
    applyReward(entryIndex, reward, true);
    if (newCard) {
      const title = await titleOf(entry.cardId);
      if (title && startedIn === generation) {
        patchStats(entryIndex, (stats) => stats.newTitles.push(title));
      }
    }
  }

  /**
   * Runs an action of the reader on a card: stores it, then lets the action count as reading
   * the card. What is stored stays stored, but if the session was reset while that took place,
   * the entry index means another card by now and nothing more is done with it.
   */
  async function act(entryIndex: number, store: (cardId: string) => Promise<void>): Promise<void> {
    const startedIn = generation;
    const entry = get().entries[entryIndex];
    if (!entry) return;
    await store(entry.cardId);
    if (startedIn !== generation) return;
    visitOf(entryIndex).acted = true;
    await creditRead(entryIndex);
  }

  // ---- Building the queue -------------------------------------------------------------------

  async function describe(): Promise<(entry: FeedEntry) => FeedStep | undefined> {
    const index = await loadContentIndex(db);
    return (entry) => {
      const card = index.cardById.get(entry.cardId);
      return (
        card && {
          categoryId: card.categoryId,
          topicId: card.topicId,
          load: entryLoad(entry.source, card.type),
        }
      );
    };
  }

  async function buildMore(): Promise<void> {
    const startedIn = generation;
    const now = new Date();
    const { entries } = get();

    if (kind === 'review') {
      const snapshot = await buildSnapshot(db, now);
      if (startedIn !== generation) return;
      set({ entries: buildReviewQueue(snapshot, now, REVIEW_SESSION_SIZE), exhausted: true });
      return;
    }

    const snapshot = await buildSnapshot(db, now, {
      previous: entries.slice(-3),
      // The card on screen counts as queued too. Its showing may not be recorded yet, and a
      // question the reader is looking at should not come back as a quiz a few cards later.
      pending: entries.slice(Math.max(furthest, 0)),
      easier,
    });
    const batch = buildBatch(snapshot, now, Math.random);
    const describeEntry = await describe();
    if (startedIn !== generation) return;

    // A hint to serve an easier card is spent once the topic has had its turn.
    for (const entry of batch) {
      const topicId = describeEntry(entry)?.topicId;
      if (topicId !== undefined && topicId in easier) {
        easier = Object.fromEntries(Object.entries(easier).filter(([key]) => key !== topicId));
      }
    }

    const exhausted = batch.length === 0;
    // Entries may have been added by a repeat while the snapshot was read.
    const placed = placeRepeats([...get().entries, ...batch], repeats, describeEntry, exhausted);
    repeats = placed.waiting;
    set({ entries: placed.entries, exhausted });
  }

  /** Builds the next stretch of the queue. Calls that overlap share one run. */
  function extend(): Promise<void> {
    if (!extending) {
      const run = buildMore().finally(() => {
        // A reset may have started another run meanwhile. That one is not this run's to clear.
        if (extending === run) extending = null;
      });
      extending = run;
    }
    return extending;
  }

  /**
   * Takes the retrievals of the given cards out of the part of the queue that was not shown
   * yet. A card that has just been answered is not asked again a few cards later.
   */
  function dropWaiting(answered: ReadonlySet<string>): void {
    const { entries } = get();
    const kept = entries.filter(
      (entry, index) =>
        index <= furthest || !isRetrieval(entry.source) || !answered.has(entry.cardId),
    );
    if (kept.length < entries.length) set({ entries: kept });
  }

  /**
   * Looks for retrievals that are still waiting although their card was answered today, which
   * happens when a review session gets to the card first, and takes them out of the queue.
   */
  async function dropAnsweredElsewhere(): Promise<void> {
    const startedIn = generation;
    const waiting = get()
      .entries.slice(furthest + 1)
      .filter((entry) => isRetrieval(entry.source));
    if (waiting.length === 0) return;

    const dayStart = learningDayStart(learningDay(new Date())).getTime();
    const states = await db.cardState.bulkGet(waiting.map((entry) => entry.cardId));
    if (startedIn !== generation) return;
    const answered = new Set<string>();
    for (const state of states) {
      if (state && state.lastAnsweredAt !== null && state.lastAnsweredAt >= dayStart) {
        answered.add(state.cardId);
      }
    }
    dropWaiting(answered);
  }

  // ---- Showing and leaving cards ------------------------------------------------------------

  function currentEntryIndex(): number | null {
    const page = pages(get())[get().pageIndex];
    return page?.kind === 'card' ? page.entryIndex : null;
  }

  function startWatching(entryIndex: number): void {
    const entry = get().entries[entryIndex];
    if (!entry || document.visibilityState !== 'visible') return;
    const visit = visitOf(entryIndex);
    if (visit.visibleSince !== null) return;
    visit.visibleSince = Date.now();

    if (!visit.seen) {
      visit.seen = true;
      void recordSeen(db, entry.cardId, new Date());
    }
    if (!visit.counted && !isRetrieval(entry.source)) {
      const remaining = Math.max(0, READ_DWELL_MS - visit.visibleMs);
      visit.readTimer = setTimeout(() => {
        void creditRead(entryIndex);
      }, remaining);
    }
  }

  /** Stops the clock of a card and books its visible time as active learning time. */
  function stopWatching(entryIndex: number): void {
    const visit = visits.get(entryIndex);
    const since = visit?.visibleSince ?? null;
    if (!visit || since === null) return;
    visit.visibleMs += Date.now() - since;
    visit.visibleSince = null;
    if (visit.readTimer !== null) {
      clearTimeout(visit.readTimer);
      visit.readTimer = null;
    }
    const capped = Math.min(visit.visibleMs, ACTIVE_SECONDS_CAP * 1000);
    const fresh = capped - visit.bookedMs;
    if (fresh > 0) {
      visit.bookedMs = capped;
      void addActiveSeconds(db, fresh / 1000, new Date());
    }
  }

  /**
   * The reader moved on from a card. A reading left almost at once counts as skipped. A quiz or
   * a myth that was left unanswered does not: passing on a question says nothing about the topic.
   */
  async function leave(entryIndex: number): Promise<void> {
    stopWatching(entryIndex);
    const entry = get().entries[entryIndex];
    const visit = visits.get(entryIndex);
    if (!entry || !visit || visit.counted || visit.acted || isRetrieval(entry.source)) return;
    if (visit.visibleMs >= QUICK_SKIP_MS) return;
    const card = await db.cards.get(entry.cardId);
    if (card && !isAnsweredOnSight(card)) await recordQuickSkip(db, entry.cardId, new Date());
  }

  function enter(pageIndex: number): void {
    const state = get();
    const page = pages(state)[pageIndex];
    if (page?.kind === 'card') {
      furthest = Math.max(furthest, page.entryIndex);
      startWatching(page.entryIndex);
    }
    if (kind !== 'feed' || state.exhausted) return;
    const reached = page?.kind === 'card' ? page.entryIndex : state.entries.length - 1;
    if (needsNextBatch(state.entries.length, reached)) void extend();
  }

  /** The queue was mixed for a learning day that is over. */
  function isStale(): boolean {
    return startedOn !== null && startedOn !== learningDay(new Date());
  }

  function onVisibilityChange(): void {
    // The app stayed open into a new learning day: yesterday's queue makes way for today's.
    if (document.visibilityState === 'visible' && isStale()) {
      reset();
      return;
    }
    const entryIndex = currentEntryIndex();
    if (entryIndex === null) return;
    if (document.visibilityState === 'visible') startWatching(entryIndex);
    else stopWatching(entryIndex);
  }

  async function start(): Promise<void> {
    const startedIn = generation;
    startedOn = learningDay(new Date());
    set({ status: 'loading' });
    await extend();
    if (startedIn !== generation) return;
    set({ status: 'ready' });
    if (attached) enter(get().pageIndex);
  }

  function reset(): void {
    generation += 1;
    for (const visit of visits.values()) {
      if (visit.readTimer !== null) clearTimeout(visit.readTimer);
    }
    visits = new Map();
    repeats = [];
    easier = {};
    furthest = -1;
    extending = null;
    startedOn = null;
    set({ ...INITIAL });
    if (attached) void start();
  }

  // ---- Answers ------------------------------------------------------------------------------

  /** Books an answer. A retrieval is graded into the schedule, a first showing is not. */
  async function answer(
    entryIndex: number,
    correct: boolean,
    retrievalGrade: Grade,
    responseMs: number,
  ): Promise<void> {
    const startedIn = generation;
    const entry = get().entries[entryIndex];
    if (!entry) return;
    const visit = visitOf(entryIndex);
    visit.acted = true;
    const retrieval = isRetrieval(entry.source);
    const countCard = !visit.counted;
    visit.counted = true;
    vibrate(correct ? 20 : [30, 50, 30]);

    const result = await recordAnswer(
      db,
      {
        cardId: entry.cardId,
        correct,
        responseMs,
        grade: retrieval ? retrievalGrade : null,
        mode: kind,
        countCard,
        newCard: countCard && isFirstReading(entry.source),
      },
      new Date(),
    );
    if (startedIn !== generation) return;
    // The next batch may already hold a quiz on this very card, picked while it was unanswered.
    dropWaiting(new Set([entry.cardId]));
    patchStats(entryIndex, (stats) => {
      stats.answers += 1;
      if (correct) stats.correct += 1;
    });
    applyReward(entryIndex, result, countCard);
    if (countCard && isFirstReading(entry.source)) {
      const title = await titleOf(entry.cardId);
      if (title && startedIn === generation) {
        patchStats(entryIndex, (stats) => stats.newTitles.push(title));
      }
    }
  }

  return {
    kind,
    useStore,
    pages,

    attach() {
      attached = true;
      document.addEventListener('visibilitychange', onVisibilityChange);
      if (isStale()) {
        reset();
      } else if (get().status === 'idle') {
        void start();
      } else if (get().status === 'ready') {
        enter(get().pageIndex);
        void dropAnsweredElsewhere();
      }
    },

    detach() {
      attached = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const entryIndex = currentEntryIndex();
      if (entryIndex !== null) stopWatching(entryIndex);
    },

    setPage(pageIndex) {
      const state = get();
      if (pageIndex === state.pageIndex) return;
      const previous = pages(state)[state.pageIndex];
      if (previous?.kind === 'card') void leave(previous.entryIndex);
      set({ pageIndex });
      enter(pageIndex);
    },

    async answerQuiz(entryIndex, choice) {
      const startedIn = generation;
      const entry = get().entries[entryIndex];
      const card = entry && (await db.cards.get(entry.cardId));
      const quiz = card && quizOf(card);
      if (startedIn !== generation) return;
      if (!quiz || (get().pages[entryIndex] ?? EMPTY_PAGE).choice !== null) return;
      const correct = choice === quiz.correctIndex;
      const responseMs = visibleTime(visitOf(entryIndex));
      patchPage(entryIndex, { choice, correct });
      await answer(entryIndex, correct, gradeForAnswer(correct, responseMs), responseMs);
    },

    async answerMyth(entryIndex, verdict) {
      const startedIn = generation;
      const entry = get().entries[entryIndex];
      const card = entry && (await db.cards.get(entry.cardId));
      if (startedIn !== generation) return;
      if (card?.type !== 'myth' || (get().pages[entryIndex] ?? EMPTY_PAGE).verdict !== null) {
        return;
      }
      const correct = verdict === card.isTrue;
      const responseMs = visibleTime(visitOf(entryIndex));
      patchPage(entryIndex, { verdict, correct });
      await answer(entryIndex, correct, gradeForAnswer(correct, responseMs), responseMs);
    },

    reveal(entryIndex) {
      const visit = visitOf(entryIndex);
      visit.revealedAfterMs ??= visibleTime(visit);
      patchPage(entryIndex, { revealed: true });
    },

    async gradeFlashcard(entryIndex, button) {
      if ((get().pages[entryIndex] ?? EMPTY_PAGE).grade !== null) return;
      const grade = gradeForFlashcard(button);
      const correct = isCorrectGrade(grade);
      const visit = visitOf(entryIndex);
      patchPage(entryIndex, { grade: button, correct });
      await answer(entryIndex, correct, grade, visit.revealedAfterMs ?? visibleTime(visit));
    },

    like(entryIndex, liked) {
      return act(entryIndex, (cardId) => setLiked(db, cardId, liked, new Date()));
    },

    bookmark(entryIndex, bookmarked) {
      return act(entryIndex, (cardId) => setBookmarked(db, cardId, bookmarked, new Date()));
    },

    known(entryIndex) {
      return act(entryIndex, (cardId) => markKnown(db, cardId, new Date()));
    },

    async notUnderstood(entryIndex) {
      const startedIn = generation;
      const entry = get().entries[entryIndex];
      if (!entry || (get().pages[entryIndex] ?? EMPTY_PAGE).notUnderstood) return;
      patchPage(entryIndex, { notUnderstood: true });
      await act(entryIndex, (cardId) => recordNotUnderstood(db, cardId, new Date()));

      // The card comes back later in this session, and its topic eases off for a moment.
      const card = (await loadContentIndex(db)).cardById.get(entry.cardId);
      const describeEntry = await describe();
      if (startedIn !== generation) return;
      if (card) easier = { ...easier, [card.topicId]: card.difficulty };
      repeats = [...repeats, scheduleRepeat(entryIndex, entry.cardId)];
      const placed = placeRepeats(get().entries, repeats, describeEntry, get().exhausted);
      repeats = placed.waiting;
      set({ entries: placed.entries });
    },

    async flag(entryIndex, note) {
      // Taking a flag back is tidying up, not engaging with the card.
      if (note !== null) {
        await act(entryIndex, (cardId) => setFlag(db, cardId, note, new Date()));
        return;
      }
      const entry = get().entries[entryIndex];
      if (entry) await setFlag(db, entry.cardId, null, new Date());
    },

    dismissLevelUp() {
      set({ levelUp: null });
    },

    reset,
  };
}

/** The feed keeps its place while the reader visits other tabs. */
export const feedSession = createSession('feed');

/** A review session starts afresh every time its screen opens. */
export const reviewSession = createSession('review');
