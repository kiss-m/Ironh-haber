/**
 * Spaced repetition (docs/SPEC.md section 9), a thin layer over ts-fsrs.
 *
 * How Kvant uses FSRS:
 *
 * - Reading a card for the first time is not a review. It only creates a schedule that is due at
 *   the start of the next learning day. The first rating comes from the first retrieval.
 * - Scheduling works in whole days (`enable_short_term: false`): there are no learning steps of
 *   minutes, and every rating leads to an interval of at least one day.
 * - A card is due for a whole learning day. The due moment is the 04:00 that starts the day,
 *   counted in learning days from the day of the review, so daylight-saving changes cannot shift
 *   it and the time of day of the review does not matter.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRS,
  type Grade,
} from 'ts-fsrs';
import { SRS } from './config.ts';
import { addLearningDays, learningDay, learningDayStart, nextLearningDayStart } from './day.ts';

/** An FSRS grade, stored as its number: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type { Grade };

export const GRADE = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const satisfies Record<string, Grade>;

/** The four buttons under a revealed flashcard: Nevedel, Ťažké, Vedel, Ľahké. */
export type FlashcardButton = keyof typeof GRADE;

/**
 * FSRS state, stored as its number: 0 New, 2 Review. Without learning steps a card is New until
 * its first rating and in Review from then on.
 */
export type SrsState = State;

export const SRS_STATE = { new: State.New, review: State.Review } as const;

/** The schedule of one card, in a form that can be stored and indexed. Times are epoch ms. */
export interface SrsRecord {
  /** The start of the learning day on which the card is due. */
  due: number;
  /** Days until recall probability drops to 90 %. */
  stability: number;
  /** 1 (easy) to 10 (hard), as FSRS sees the card. */
  difficulty: number;
  /** Length of the current interval in days. */
  scheduledDays: number;
  /** Number of ratings so far. Zero means the card has only been read. */
  reps: number;
  lapses: number;
  state: SrsState;
  lastReview: number | null;
}

function clampRetention(retention: number): number {
  return Math.min(SRS.maxRetention, Math.max(SRS.minRetention, retention));
}

const schedulers = new Map<number, FSRS>();

function scheduler(retention: number): FSRS {
  const key = clampRetention(retention);
  let instance = schedulers.get(key);
  if (!instance) {
    instance = fsrs(
      generatorParameters({
        request_retention: key,
        maximum_interval: SRS.maximumIntervalDays,
        // The fuzz is seeded from the card and the review time, so it stays deterministic.
        enable_fuzz: true,
        enable_short_term: false,
      }),
    );
    schedulers.set(key, instance);
  }
  return instance;
}

function toCard(record: SrsRecord): Card {
  return {
    due: new Date(record.due),
    stability: record.stability,
    difficulty: record.difficulty,
    // Not an input: elapsed time is derived from last_review. The type still requires the field.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- required until ts-fsrs 6
    elapsed_days: 0,
    scheduled_days: record.scheduledDays,
    learning_steps: 0,
    reps: record.reps,
    lapses: record.lapses,
    state: record.state,
    ...(record.lastReview === null ? {} : { last_review: new Date(record.lastReview) }),
  };
}

/** The schedule created by the first exposure: unrated, due when the next learning day starts. */
export function newSchedule(now: Date): SrsRecord {
  const card = createEmptyCard(now);
  return {
    due: nextLearningDayStart(now).getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    lastReview: null,
  };
}

/** The schedule after rating a card at `now`. */
export function review(
  record: SrsRecord,
  grade: Grade,
  now: Date,
  retention: number = SRS.defaultRetention,
): SrsRecord {
  const { card } = scheduler(retention).next(toCard(record), now, grade);
  // ts-fsrs keeps Hard < Good < Easy even at the cap, so it can overshoot the maximum interval
  // by a day or two. The interval it reports is not an input of later reviews, so clamp it.
  const scheduledDays = Math.min(SRS.maximumIntervalDays, Math.max(1, card.scheduled_days));
  const dueDay = addLearningDays(learningDay(now), scheduledDays);
  return {
    due: learningDayStart(dueDay).getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: now.getTime(),
  };
}

/** Grade of an answer that is either right or wrong: a quiz, an embedded quiz or a myth. */
export function gradeForAnswer(correct: boolean, responseMs: number): Grade {
  if (!correct) return GRADE.again;
  return responseMs > SRS.slowAnswerMs ? GRADE.hard : GRADE.good;
}

/** Grade of a self-rated flashcard. */
export function gradeForFlashcard(button: FlashcardButton): Grade {
  return GRADE[button];
}

/** Whether a grade counts as a correct answer for XP, accuracy and adaptive difficulty. */
export function isCorrectGrade(grade: Grade): boolean {
  return grade !== GRADE.again;
}

export function isDue(record: SrsRecord, now: Date): boolean {
  return record.due <= now.getTime();
}

/** Whether the card has been rated at least once, as opposed to only read. */
export function isReviewed(record: SrsRecord): boolean {
  return record.reps > 0;
}

/** Mastered: in the Review state with a stability of at least 21 days. */
export function isMastered(record: SrsRecord): boolean {
  return record.state === State.Review && record.stability >= SRS.masteredStabilityDays;
}

/** Probability, from 0 to 1, that the card would be recalled at `now`. Zero if never rated. */
export function retrievability(record: SrsRecord, now: Date): number {
  if (!isReviewed(record)) return 0;
  return scheduler(SRS.defaultRetention).get_retrievability(toCard(record), now, false);
}

/**
 * Sharpness (Ostrosť) of a set of cards: the mean retrievability of those rated at least once.
 * Null while none has been rated.
 */
export function sharpness(records: readonly SrsRecord[], now: Date): number | null {
  const rated = records.filter(isReviewed);
  if (rated.length === 0) return null;
  const total = rated.reduce((sum, record) => sum + retrievability(record, now), 0);
  return total / rated.length;
}
