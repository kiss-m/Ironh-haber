/**
 * Everything the reader's actions write: what was seen, read and answered, the XP it earned and
 * how it moved the schedule, the topic affinity and the difficulty target.
 *
 * Each function is one IndexedDB transaction, so a card is never half recorded. The rules
 * themselves live in src/core. This file only loads rows, applies those rules and stores the
 * result.
 *
 * Terms: a card is *seen* when it is shown, *read* when the reader stayed for three seconds or
 * acted on it, and *counted* when it goes toward the daily goal (read or answered).
 */
import type { AttributeCode } from '../../shared/taxonomy.ts';
import { applyAffinity, type AffinitySignal } from '../core/affinity.ts';
import { characterProgress } from '../core/character.ts';
import { AFFINITY, XP } from '../core/config.ts';
import { learningDay, learningDayStart } from '../core/day.ts';
import { initialDifficulty, recordGradedAnswer } from '../core/difficulty.ts';
import { GRADE, isMastered, isReviewed, newSchedule, review, type Grade } from '../core/srs.ts';
import { answerXp, nextCorrectStreak } from '../core/xp.ts';
import type { KvantDb } from './db.ts';
import { loadSettings } from './profile.ts';
import type { CardStateRow, DailyRow, EventType, LearningDay, ReviewMode } from './types.ts';

/** What an action earned. */
export interface Reward {
  /** XP gained, including the bonus for reaching the daily goal. */
  xp: number;
  /** The character level after the action. */
  level: number;
  leveledUp: boolean;
  /** True when this very action completed the daily goal. */
  goalReached: boolean;
}

export interface AnswerInput {
  cardId: string;
  correct: boolean;
  responseMs: number;
  /**
   * The FSRS grade when the answer is a retrieval. Null for an answer given the first time a
   * card is shown: that is an exposure, not a review, and leaves the schedule alone.
   *
   * A card is rated at most once per learning day, because the schedule works in whole days.
   * A second retrieval on the same day (the feed and a review session can both hold the card)
   * counts as practice: it earns its XP and leaves the schedule alone.
   */
  grade: Grade | null;
  mode: ReviewMode;
  /** Count the card toward the daily goal. False when this showing was already counted. */
  countCard: boolean;
  /** Also award the XP for reading a new card. */
  newCard: boolean;
}

export interface AnswerResult extends Reward {
  /** Correct answers in a row after this one. */
  correctStreak: number;
  /** True when this answer made the card mastered. */
  mastered: boolean;
}

export function emptyDaily(day: LearningDay): DailyRow {
  return {
    learningDay: day,
    cardsSeen: 0,
    newCards: 0,
    newCardsRead: 0,
    answers: 0,
    correct: 0,
    correctStreak: 0,
    xp: 0,
    activeSeconds: 0,
    goalMet: false,
    quests: [],
  };
}

function freshState(cardId: string, now: Date): CardStateRow {
  return {
    cardId,
    firstSeenAt: now.getTime(),
    lastSeenAt: now.getTime(),
    seenCount: 0,
    liked: false,
    bookmarked: false,
    known: false,
    flagged: null,
    // First exposure is not a review: the schedule starts unrated, due on the next learning day.
    srs: newSchedule(now),
    masteredAt: null,
    lastAnsweredAt: null,
  };
}

async function loadDaily(db: KvantDb, now: Date): Promise<DailyRow> {
  const day = learningDay(now);
  return (await db.daily.get(day)) ?? emptyDaily(day);
}

async function log(
  db: KvantDb,
  now: Date,
  type: EventType,
  cardId?: string,
  payload?: unknown,
): Promise<void> {
  await db.events.add({
    ts: now.getTime(),
    learningDay: learningDay(now),
    type,
    ...(cardId === undefined ? {} : { cardId }),
    ...(payload === undefined ? {} : { payload }),
  });
}

/** The card's state, created on the spot if the card was never recorded as seen. */
async function stateOf(db: KvantDb, daily: DailyRow, cardId: string, now: Date) {
  const existing = await db.cardState.get(cardId);
  if (existing) return existing;
  daily.newCards += 1;
  await log(db, now, 'card_seen', cardId);
  return freshState(cardId, now);
}

async function attributeOf(db: KvantDb, cardId: string): Promise<AttributeCode | undefined> {
  const card = await db.cards.get(cardId);
  return card && (await db.categories.get(card.categoryId))?.attribute;
}

async function shiftAffinity(db: KvantDb, cardId: string, signal: AffinitySignal): Promise<void> {
  const card = await db.cards.get(cardId);
  if (!card) return;
  const current = (await db.topicAffinity.get(card.topicId))?.affinity ?? AFFINITY.initial;
  await db.topicAffinity.put({ topicId: card.topicId, affinity: applyAffinity(current, signal) });
}

/**
 * Books XP to the character and the day, counts the card toward the goal, and pays the goal
 * bonus the moment the goal is reached. Changes `daily` in place. The caller stores it.
 */
async function credit(
  db: KvantDb,
  daily: DailyRow,
  now: Date,
  options: { cardId: string; xp: number; countCard: boolean },
): Promise<Reward> {
  const character = await db.character.get('me');
  const settings = await loadSettings(db);
  let xp = options.xp;
  let goalReached = false;

  if (options.countCard) {
    daily.cardsSeen += 1;
    if (!daily.goalMet && daily.cardsSeen >= settings.dailyGoal) {
      daily.goalMet = true;
      goalReached = true;
      xp += XP.dailyGoal;
      await log(db, now, 'goal_met');
    }
  }
  daily.xp += xp;

  // Before onboarding there is no character to credit. The day's numbers still count.
  if (!character) return { xp, level: 1, leveledUp: false, goalReached };

  const before = characterProgress(character.totalXp).level;
  character.totalXp += xp;
  const attribute = await attributeOf(db, options.cardId);
  // The goal bonus belongs to the day, not to a card, so it goes to no attribute.
  if (attribute) character.attributeXp[attribute] += options.xp;
  await db.character.put(character);

  const level = characterProgress(character.totalXp).level;
  if (level > before) await log(db, now, 'level_up', undefined, { level });
  return { xp, level, leveledUp: level > before, goalReached };
}

const PROGRESS_TABLES = [
  'cards',
  'categories',
  'cardState',
  'reviewLog',
  'events',
  'daily',
  'character',
  'settings',
  'topicAffinity',
  'categoryDifficulty',
] as const;

/** Runs `work` in one transaction over everything progress writes can touch. */
function atomic<T>(db: KvantDb, work: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [...PROGRESS_TABLES], work);
}

/** The card is on screen. A first showing creates its state and its schedule. */
export function recordSeen(db: KvantDb, cardId: string, now: Date): Promise<void> {
  return atomic(db, async () => {
    const daily = await loadDaily(db, now);
    const state = await stateOf(db, daily, cardId, now);
    state.lastSeenAt = now.getTime();
    state.seenCount += 1;
    await db.cardState.put(state);
    await db.daily.put(daily);
  });
}

/**
 * The card was read: the reader stayed three seconds or acted on it. Counts toward the daily
 * goal. Only the first reading of a new card earns XP.
 */
export function recordRead(
  db: KvantDb,
  cardId: string,
  now: Date,
  options: { newCard: boolean },
): Promise<Reward> {
  return atomic(db, async () => {
    const daily = await loadDaily(db, now);
    const reward = await credit(db, daily, now, {
      cardId,
      xp: options.newCard ? XP.newCardRead : 0,
      countCard: true,
    });
    if (options.newCard) daily.newCardsRead += 1;
    await db.daily.put(daily);
    await log(db, now, 'card_read', cardId, { xp: reward.xp });
    return reward;
  });
}

/** The reader answered a quiz, a myth or a flashcard. */
export function recordAnswer(db: KvantDb, input: AnswerInput, now: Date): Promise<AnswerResult> {
  return atomic(db, async () => {
    const daily = await loadDaily(db, now);
    const state = await stateOf(db, daily, input.cardId, now);
    const settings = await loadSettings(db);
    let mastered = false;

    const dayStart = learningDayStart(learningDay(now)).getTime();
    const lastReview = state.srs?.lastReview ?? null;
    const ratedToday = lastReview !== null && lastReview >= dayStart;
    const grade = ratedToday ? null : input.grade;

    if (grade !== null) {
      state.srs = review(state.srs ?? newSchedule(now), grade, now, settings.desiredRetention);
      if (state.masteredAt === null && isMastered(state.srs)) {
        state.masteredAt = now.getTime();
        mastered = true;
      }
      await db.reviewLog.add({
        cardId: input.cardId,
        ts: now.getTime(),
        rating: grade,
        mode: input.mode,
        responseMs: input.responseMs,
      });
    }
    state.lastAnsweredAt = now.getTime();
    await db.cardState.put(state);

    daily.answers += 1;
    if (input.correct) daily.correct += 1;
    daily.correctStreak = nextCorrectStreak(daily.correctStreak, input.correct);

    const reward = await credit(db, daily, now, {
      cardId: input.cardId,
      xp: answerXp(input.correct, daily.correctStreak) + (input.newCard ? XP.newCardRead : 0),
      countCard: input.countCard,
    });
    if (input.newCard) daily.newCardsRead += 1;
    await db.daily.put(daily);

    const card = await db.cards.get(input.cardId);
    const category = card && (await db.categories.get(card.categoryId));
    if (category) {
      const difficulty =
        (await db.categoryDifficulty.get(category.id)) ??
        initialDifficulty(category.defaultDifficulty);
      await db.categoryDifficulty.put({
        ...recordGradedAnswer(difficulty, input.correct),
        categoryId: category.id,
      });
    }

    await log(db, now, 'answer', input.cardId, {
      correct: input.correct,
      grade,
      mode: input.mode,
      responseMs: input.responseMs,
    });
    return { ...reward, correctStreak: daily.correctStreak, mastered };
  });
}

/** Changes one flag of a card's state and moves the topic affinity with it. */
async function toggle(
  db: KvantDb,
  cardId: string,
  now: Date,
  flag: 'liked' | 'bookmarked',
  value: boolean,
): Promise<void> {
  await atomic(db, async () => {
    const daily = await loadDaily(db, now);
    const state = await stateOf(db, daily, cardId, now);
    await db.daily.put(daily);
    if (state[flag] === value) {
      await db.cardState.put(state);
      return;
    }
    state[flag] = value;
    await db.cardState.put(state);
    const signal: AffinitySignal =
      flag === 'liked' ? (value ? 'like' : 'unlike') : value ? 'bookmark' : 'unbookmark';
    await shiftAffinity(db, cardId, signal);
    await log(db, now, flag === 'liked' ? 'like' : 'bookmark', cardId, { value });
  });
}

/** "Viac takého". */
export function setLiked(db: KvantDb, cardId: string, liked: boolean, now: Date): Promise<void> {
  return toggle(db, cardId, now, 'liked', liked);
}

/** "Uložiť". */
export function setBookmarked(
  db: KvantDb,
  cardId: string,
  bookmarked: boolean,
  now: Date,
): Promise<void> {
  return toggle(db, cardId, now, 'bookmarked', bookmarked);
}

/**
 * "Už viem". On a card that was never rated this applies the grade Easy, which pushes the first
 * review about a week out. A card that already has ratings keeps its schedule.
 */
export function markKnown(db: KvantDb, cardId: string, now: Date): Promise<void> {
  return atomic(db, async () => {
    const daily = await loadDaily(db, now);
    const state = await stateOf(db, daily, cardId, now);
    await db.daily.put(daily);
    if (state.known) {
      await db.cardState.put(state);
      return;
    }
    state.known = true;
    const schedule = state.srs ?? newSchedule(now);
    if (!isReviewed(schedule)) {
      const settings = await loadSettings(db);
      state.srs = review(schedule, GRADE.easy, now, settings.desiredRetention);
      await db.reviewLog.add({
        cardId,
        ts: now.getTime(),
        rating: GRADE.easy,
        mode: 'feed',
        responseMs: 0,
      });
    }
    await db.cardState.put(state);
    await shiftAffinity(db, cardId, 'known');
    await log(db, now, 'known', cardId);
  });
}

/** "Nerozumiem". The feed session brings the card back. Here it is only noted. */
export function recordNotUnderstood(db: KvantDb, cardId: string, now: Date): Promise<void> {
  return atomic(db, () => log(db, now, 'not_understood', cardId));
}

/** "Chyba": flags the card with an optional note, or removes the flag with `null`. */
export function setFlag(
  db: KvantDb,
  cardId: string,
  note: string | null,
  now: Date,
): Promise<void> {
  return atomic(db, async () => {
    const daily = await loadDaily(db, now);
    const state = await stateOf(db, daily, cardId, now);
    await db.daily.put(daily);
    state.flagged = note === null ? null : { at: now.getTime(), note: note.trim() };
    await db.cardState.put(state);
    await log(db, now, 'flag', cardId, { flagged: note !== null });
  });
}

/** A card that is not a question was left within two seconds: the topic seems less wanted. */
export function recordQuickSkip(db: KvantDb, cardId: string, now: Date): Promise<void> {
  return atomic(db, async () => {
    await shiftAffinity(db, cardId, 'quickSkip');
    await log(db, now, 'quick_skip', cardId);
  });
}

/** Adds learning time to the day. The caller has already applied the per-card cap. */
export function addActiveSeconds(db: KvantDb, seconds: number, now: Date): Promise<void> {
  if (seconds <= 0) return Promise.resolve();
  return atomic(db, async () => {
    const daily = await loadDaily(db, now);
    daily.activeSeconds += seconds;
    await db.daily.put(daily);
  });
}
