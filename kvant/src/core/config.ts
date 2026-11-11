/**
 * Every tunable number of the learning model in one place (docs/SPEC.md sections 7 to 10).
 * The values the user can change in Settings are only defaults here.
 */

// ---- Learning day (section 7) -----------------------------------------------------------------

/** A learning day runs from 04:00 to 04:00 local time, so late-night learning counts as "today". */
export const DAY_START_HOUR = 4;

// ---- Feed mixer (section 8) -------------------------------------------------------------------

export const BATCH_SIZE = 10;

/** What a batch is made of. The three numbers add up to BATCH_SIZE. */
export const BATCH_SLOTS = { new: 6, retrieval: 3, serendipity: 1 } as const;

/** With more than this many due reviews, a batch switches to BACKLOG_SLOTS. */
export const BACKLOG_THRESHOLD = 30;
export const BACKLOG_SLOTS = { new: 4, retrieval: 5, serendipity: 1 } as const;

/** Default daily cap on new cards. */
export const NEW_CARD_CAP = 40;

export const MAX_CATEGORY_RUN = 2;
export const MAX_HEAVY_RUN = 3;

/** A topic unlocks when at least this share of each prerequisite topic has been seen. */
export const PREREQUISITE_SEEN_SHARE = 0.5;

/** How much more likely a topic that is already in progress is to be continued. */
export const IN_PROGRESS_TOPIC_BOOST = 3;

/** New cards within this distance of the category's difficulty target are preferred. */
export const DIFFICULTY_TOLERANCE = 1;

/** Without due reviews, a retrieval slot quizzes a card seen within this many hours. */
export const RECENT_QUIZ_WINDOW_HOURS = 72;

/** An attribute below this sharpness is "rusting" and its due cards come first. */
export const RUSTY_SHARPNESS = 0.7;

export const SERENDIPITY_MAX_DIFFICULTY = 2;

/** The next batch is built when this many cards are left. */
export const NEXT_BATCH_LOOKAHEAD = 3;

/** "Nerozumiem" brings the card back after at least this many other cards. */
export const REQUEUE_MIN_GAP = 5;

/** A review session takes at most this many due cards, so it stays a finishable set. */
export const REVIEW_SESSION_SIZE = 20;

export const AFFINITY = {
  initial: 1,
  min: 0.5,
  max: 2,
  like: 0.15,
  bookmark: 0.1,
  known: -0.05,
  quickSkip: -0.03,
} as const;

/** Leaving a non-interactive card sooner than this counts as skipping it. */
export const QUICK_SKIP_MS = 2000;

/** Adaptive difficulty of a category. */
export const ADAPTIVE = {
  /** The target looks at this many most recent graded answers. */
  window: 20,
  minAnswers: 8,
  /** At most one adjustment per this many answers. */
  cooldown: 10,
  raiseAbove: 0.85,
  lowerBelow: 0.6,
  min: 1,
  max: 5,
} as const;

// ---- Spaced repetition (section 9) ------------------------------------------------------------

export const SRS = {
  defaultRetention: 0.9,
  minRetention: 0.85,
  maxRetention: 0.95,
  maximumIntervalDays: 365,
  /** A correct answer slower than this is graded Hard instead of Good. */
  slowAnswerMs: 20_000,
  /** A card in the Review state with at least this stability is mastered. */
  masteredStabilityDays: 21,
} as const;

// ---- Game layer (section 10) ------------------------------------------------------------------

export const XP = {
  newCardRead: 5,
  correctAnswer: 10,
  wrongAnswer: 2,
  /** From this many correct answers in a row, answer XP is multiplied until a miss. */
  streakFrom: 3,
  streakMultiplier: 1.5,
  dailyGoal: 50,
  quest: 25,
  allQuests: 50,
  bossWin: 150,
} as const;

/** A new card counts as read after this dwell time, or at once after any action. */
export const READ_DWELL_MS = 3000;

/** XP from level n to n + 1 is round(base × n ^ exponent). */
export const LEVEL = { characterBase: 60, attributeBase: 30, exponent: 1.5 } as const;

export const DAILY_GOALS = [10, 20, 40] as const;
export const DEFAULT_DAILY_GOAL = 20;

/** Weight of a freshly selected category, on the 0–100 scale. */
export const DEFAULT_CATEGORY_WEIGHT = 50;

/** Active time is counted per card and never beyond this many seconds. */
export const ACTIVE_SECONDS_CAP = 90;
