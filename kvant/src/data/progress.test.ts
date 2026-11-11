import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GRADE, SRS_STATE, isDue, review } from '../core/srs.ts';
import { createDb, type KvantDb } from './db.ts';
import { createProfile, updateSettings } from './profile.ts';
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
  type AnswerInput,
} from './progress.ts';
import type { CardRow } from './types.ts';

/** Tests give instants in UTC and expect Europe/Prague local time (set in vite.config.ts). */
function utc(iso: string): Date {
  return new Date(`${iso}Z`);
}

const EVENING = utc('2026-11-10T18:00:00'); // 19:00, learning day 10 November
const DAY = '2026-11-10';

const A1 = 'robotika.zaklady.a1';
const A2 = 'robotika.zaklady.a2';
const W1 = 'ako-veci-funguju.v-kuchyni.w1';

function quizRow(id: string): CardRow {
  const [categoryId = '', topicSlug = ''] = id.split('.');
  return {
    id,
    topicId: `${categoryId}.${topicSlug}`,
    categoryId,
    type: 'quiz',
    difficulty: 2,
    order: 1,
    title: 'Karta',
    question: 'Otázka?',
    options: ['A', 'B', 'C'],
    correctIndex: 0,
    explanation: 'Vysvetlenie.',
    tags: [],
    contentHash: 'a3f1c29b7e0d4a55',
    archived: false,
  };
}

function answer(cardId: string, patch: Partial<AnswerInput> = {}): AnswerInput {
  return {
    cardId,
    correct: true,
    responseMs: 4_000,
    grade: GRADE.good,
    mode: 'feed',
    countCard: true,
    newCard: false,
    ...patch,
  };
}

let db: KvantDb;

beforeEach(async () => {
  db = createDb();
  await db.categories.bulkPut([
    {
      id: 'robotika',
      name: 'Robotika',
      attribute: 'T',
      description: 'Opis.',
      color: '#4F8EF7',
      icon: 'bot',
      defaultDifficulty: 3,
    },
    {
      id: 'ako-veci-funguju',
      name: 'Ako veci fungujú',
      attribute: 'W',
      description: 'Opis.',
      color: '#2EC4B6',
      icon: 'lightbulb',
      defaultDifficulty: 2,
    },
  ]);
  await db.cards.bulkPut([quizRow(A1), quizRow(A2), quizRow(W1)]);
  await createProfile(
    db,
    { name: 'Skúšobná postava', categoryWeights: { robotika: 50 }, dailyGoal: 20, theme: 'dark' },
    utc('2026-11-01T10:00:00'),
  );
});

afterEach(async () => {
  await db.delete();
});

describe('recordSeen', () => {
  it('creates the state and an unrated schedule on the first showing', async () => {
    await recordSeen(db, A1, EVENING);

    const state = await db.cardState.get(A1);
    expect(state).toMatchObject({
      cardId: A1,
      firstSeenAt: EVENING.getTime(),
      lastSeenAt: EVENING.getTime(),
      seenCount: 1,
      liked: false,
      bookmarked: false,
      known: false,
      flagged: null,
      masteredAt: null,
      lastAnsweredAt: null,
    });
    // Not a review: no rating yet, due when the next learning day starts.
    expect(state?.srs?.reps).toBe(0);
    expect(state?.srs?.state).toBe(SRS_STATE.new);
    expect(new Date(state!.srs!.due).toISOString()).toBe('2026-11-11T03:00:00.000Z');
    expect(await db.reviewLog.count()).toBe(0);
  });

  it('counts a new card for the day, but not toward the goal and without XP', async () => {
    await recordSeen(db, A1, EVENING);

    expect(await db.daily.get(DAY)).toMatchObject({ newCards: 1, cardsSeen: 0, xp: 0 });
    expect((await db.character.get('me'))?.totalXp).toBe(0);
  });

  it('only updates the counters when the card is shown again', async () => {
    await recordSeen(db, A1, EVENING);
    const later = utc('2026-11-10T19:30:00');
    await recordSeen(db, A1, later);

    expect(await db.cardState.get(A1)).toMatchObject({
      firstSeenAt: EVENING.getTime(),
      lastSeenAt: later.getTime(),
      seenCount: 2,
    });
    expect((await db.daily.get(DAY))?.newCards).toBe(1);
    expect(await db.events.where('type').equals('card_seen').count()).toBe(1);
  });
});

describe('recordRead', () => {
  it('gives 5 XP for a new card, to the character and to the attribute of the card', async () => {
    await recordSeen(db, A1, EVENING);
    const reward = await recordRead(db, A1, EVENING, { newCard: true });

    expect(reward).toEqual({ xp: 5, level: 1, leveledUp: false, goalReached: false });
    expect(await db.character.get('me')).toMatchObject({
      totalXp: 5,
      attributeXp: { T: 5, R: 0, B: 0, M: 0, W: 0, J: 0 },
    });
    expect(await db.daily.get(DAY)).toMatchObject({ cardsSeen: 1, xp: 5 });
  });

  it('books XP to the attribute of the category the card belongs to', async () => {
    await recordSeen(db, W1, EVENING);
    await recordRead(db, W1, EVENING, { newCard: true });

    expect((await db.character.get('me'))?.attributeXp).toMatchObject({ T: 0, W: 5 });
  });

  it('counts a second reading toward the goal without XP', async () => {
    await recordSeen(db, A1, EVENING);
    const reward = await recordRead(db, A1, EVENING, { newCard: false });

    expect(reward.xp).toBe(0);
    expect(await db.daily.get(DAY)).toMatchObject({ cardsSeen: 1, xp: 0 });
  });

  it('pays 50 XP once when the daily goal is reached', async () => {
    await updateSettings(db, { dailyGoal: 2 });

    const first = await recordRead(db, A1, EVENING, { newCard: true });
    expect(first.goalReached).toBe(false);

    const second = await recordRead(db, A2, EVENING, { newCard: true });
    expect(second).toMatchObject({ xp: 55, goalReached: true });
    expect(await db.daily.get(DAY)).toMatchObject({ cardsSeen: 2, goalMet: true, xp: 60 });
    // The bonus is not tied to a card, so it goes to the total only.
    expect(await db.character.get('me')).toMatchObject({ totalXp: 60, attributeXp: { T: 10 } });

    const third = await recordRead(db, W1, EVENING, { newCard: true });
    expect(third).toMatchObject({ xp: 5, goalReached: false });
    expect(await db.events.where('type').equals('goal_met').count()).toBe(1);
  });

  it('reports a level-up when the XP crosses a level', async () => {
    await db.character.update('me', { totalXp: 57 });

    const reward = await recordRead(db, A1, EVENING, { newCard: true });

    expect(reward).toMatchObject({ level: 2, leveledUp: true });
    const events = await db.events.where('type').equals('level_up').toArray();
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ level: 2 });
  });
});

describe('recordAnswer on a retrieval', () => {
  beforeEach(async () => {
    await recordSeen(db, A1, EVENING);
  });

  const NEXT_DAY = utc('2026-11-11T18:00:00');

  it('rates the card, moves its due day and logs the review', async () => {
    const result = await recordAnswer(db, answer(A1), NEXT_DAY);

    expect(result).toMatchObject({ xp: 10, correctStreak: 1, mastered: false });
    const state = await db.cardState.get(A1);
    expect(state?.srs).toMatchObject({ reps: 1, state: SRS_STATE.review });
    expect(isDue(state!.srs!, NEXT_DAY)).toBe(false);
    expect(state?.lastAnsweredAt).toBe(NEXT_DAY.getTime());

    expect(await db.reviewLog.toArray()).toEqual([
      {
        id: 1,
        cardId: A1,
        ts: NEXT_DAY.getTime(),
        rating: GRADE.good,
        mode: 'feed',
        responseMs: 4_000,
      },
    ]);
    expect(await db.daily.get('2026-11-11')).toMatchObject({
      answers: 1,
      correct: 1,
      correctStreak: 1,
      cardsSeen: 1,
      xp: 10,
    });
  });

  it('brings a missed card back the next learning day', async () => {
    await recordAnswer(db, answer(A1, { correct: false, grade: GRADE.again }), NEXT_DAY);

    const state = await db.cardState.get(A1);
    expect(state?.srs?.scheduledDays).toBe(1);
    expect(new Date(state!.srs!.due).toISOString()).toBe('2026-11-12T03:00:00.000Z');
    expect(await db.daily.get('2026-11-11')).toMatchObject({ answers: 1, correct: 0, xp: 2 });
  });

  it('uses the desired retention from the settings', async () => {
    await updateSettings(db, { desiredRetention: 0.95 });
    const before = (await db.cardState.get(A1))!.srs!;

    await recordAnswer(db, answer(A1), NEXT_DAY);

    expect((await db.cardState.get(A1))?.srs).toEqual(review(before, GRADE.good, NEXT_DAY, 0.95));
  });

  it('pays 10, 10, 15, 15 for a streak, 2 for the miss, then starts over', async () => {
    const earned: number[] = [];
    for (const correct of [true, true, true, true, false, true]) {
      const result = await recordAnswer(
        db,
        answer(A1, { correct, grade: correct ? GRADE.good : GRADE.again, countCard: false }),
        NEXT_DAY,
      );
      earned.push(result.xp);
    }
    expect(earned).toEqual([10, 10, 15, 15, 2, 10]);
    expect(await db.daily.get('2026-11-11')).toMatchObject({
      answers: 6,
      correct: 5,
      correctStreak: 1,
      cardsSeen: 0,
      xp: 62,
    });
    expect((await db.character.get('me'))?.attributeXp.T).toBe(62);
  });

  it('marks a card mastered once, when its stability reaches 21 days', async () => {
    let when = NEXT_DAY;
    const mastered: boolean[] = [];
    for (let round = 0; round < 4; round += 1) {
      const result = await recordAnswer(db, answer(A1), when);
      mastered.push(result.mastered);
      when = new Date((await db.cardState.get(A1))!.srs!.due + 15 * 60 * 60 * 1000);
    }
    expect(mastered.filter(Boolean)).toHaveLength(1);
    const state = await db.cardState.get(A1);
    expect(state?.srs?.stability).toBeGreaterThanOrEqual(21);
    const masteredAt = state?.masteredAt;
    expect(masteredAt).not.toBeNull();

    // A later lapse does not take the card out of the Collection.
    const lapse = await recordAnswer(db, answer(A1, { correct: false, grade: GRADE.again }), when);
    expect(lapse.mastered).toBe(false);
    expect((await db.cardState.get(A1))?.masteredAt).toBe(masteredAt);
  });

  it('feeds the adaptive difficulty of the category', async () => {
    expect(await db.categoryDifficulty.get('robotika')).toBeUndefined();

    for (let i = 0; i < 8; i += 1) {
      await recordAnswer(db, answer(A1, { countCard: false }), NEXT_DAY);
    }

    // Eight correct answers in a row raise the target from the default 3 to 4.
    expect(await db.categoryDifficulty.get('robotika')).toMatchObject({
      categoryId: 'robotika',
      target: 4,
      answersSinceAdjust: 0,
    });
    expect(await db.categoryDifficulty.get('ako-veci-funguju')).toBeUndefined();
  });

  it('labels reviews done in a review session', async () => {
    await recordAnswer(db, answer(A1, { mode: 'review' }), NEXT_DAY);

    expect((await db.reviewLog.toArray())[0]?.mode).toBe('review');
  });
});

describe('recordAnswer on a first showing', () => {
  it('is not a review: the schedule and the review log stay untouched', async () => {
    await recordSeen(db, A1, EVENING);
    const before = (await db.cardState.get(A1))!.srs;

    const result = await recordAnswer(db, answer(A1, { grade: null, newCard: true }), EVENING);

    // 10 for the correct answer plus 5 for reading a new card.
    expect(result).toMatchObject({ xp: 15, correctStreak: 1, mastered: false });
    const state = await db.cardState.get(A1);
    expect(state?.srs).toEqual(before);
    expect(state?.lastAnsweredAt).toBe(EVENING.getTime());
    expect(await db.reviewLog.count()).toBe(0);
    expect(await db.daily.get(DAY)).toMatchObject({
      answers: 1,
      correct: 1,
      cardsSeen: 1,
      newCards: 1,
      xp: 15,
    });
  });

  it('still counts for accuracy and adaptive difficulty', async () => {
    await recordSeen(db, A1, EVENING);
    await recordAnswer(db, answer(A1, { correct: false, grade: null, newCard: true }), EVENING);

    expect(await db.daily.get(DAY)).toMatchObject({ answers: 1, correct: 0, xp: 7 });
    expect((await db.categoryDifficulty.get('robotika'))?.recent).toEqual([false]);
  });

  it('creates the state if the card was somehow never recorded as seen', async () => {
    await recordAnswer(db, answer(A1, { grade: null, newCard: true }), EVENING);

    expect((await db.cardState.get(A1))?.srs?.reps).toBe(0);
    expect((await db.daily.get(DAY))?.newCards).toBe(1);
  });
});

describe('actions', () => {
  beforeEach(async () => {
    await recordSeen(db, A1, EVENING);
  });

  const affinity = async () => (await db.topicAffinity.get('robotika.zaklady'))?.affinity;

  it('"Viac takého" raises the affinity of the topic, and taking it back undoes that', async () => {
    await setLiked(db, A1, true, EVENING);
    expect((await db.cardState.get(A1))?.liked).toBe(true);
    expect(await affinity()).toBe(1.15);

    // A second tap on an already liked card changes nothing.
    await setLiked(db, A1, true, EVENING);
    expect(await affinity()).toBe(1.15);

    await setLiked(db, A1, false, EVENING);
    expect((await db.cardState.get(A1))?.liked).toBe(false);
    expect(await affinity()).toBe(1);
  });

  it('"Uložiť" bookmarks the card and raises the affinity by 0.10', async () => {
    await setBookmarked(db, A1, true, EVENING);
    expect((await db.cardState.get(A1))?.bookmarked).toBe(true);
    expect(await affinity()).toBe(1.1);

    await setBookmarked(db, A1, false, EVENING);
    expect(await affinity()).toBe(1);
  });

  it('"Už viem" applies Easy to a card that was never rated', async () => {
    await markKnown(db, A1, EVENING);

    const state = await db.cardState.get(A1);
    expect(state?.known).toBe(true);
    expect(state?.srs).toMatchObject({ reps: 1, state: SRS_STATE.review });
    expect(state!.srs!.scheduledDays).toBeGreaterThanOrEqual(7);
    expect(await affinity()).toBe(0.95);
    expect(await db.reviewLog.toArray()).toMatchObject([{ cardId: A1, rating: GRADE.easy }]);
  });

  it('"Už viem" leaves the schedule of an already rated card alone', async () => {
    await recordAnswer(db, answer(A1), utc('2026-11-11T18:00:00'));
    const before = (await db.cardState.get(A1))!.srs;

    await markKnown(db, A1, utc('2026-11-11T18:05:00'));

    const state = await db.cardState.get(A1);
    expect(state?.known).toBe(true);
    expect(state?.srs).toEqual(before);
    expect(await db.reviewLog.count()).toBe(1);
  });

  it('"Už viem" twice counts once', async () => {
    await markKnown(db, A1, EVENING);
    await markKnown(db, A1, EVENING);

    expect(await affinity()).toBe(0.95);
    expect(await db.reviewLog.count()).toBe(1);
  });

  it('"Chyba" stores the note and can be taken back', async () => {
    await setFlag(db, A1, '  Preklep v druhej vete. ', EVENING);
    expect((await db.cardState.get(A1))?.flagged).toEqual({
      at: EVENING.getTime(),
      note: 'Preklep v druhej vete.',
    });

    await setFlag(db, A1, '', EVENING);
    expect((await db.cardState.get(A1))?.flagged).toEqual({ at: EVENING.getTime(), note: '' });

    await setFlag(db, A1, null, EVENING);
    expect((await db.cardState.get(A1))?.flagged).toBeNull();
  });

  it('a quick skip lowers the affinity by 0.03', async () => {
    await recordQuickSkip(db, A1, EVENING);
    await recordQuickSkip(db, A1, EVENING);

    expect(await affinity()).toBe(0.94);
  });

  it('"Nerozumiem" is logged and changes nothing else', async () => {
    const before = await db.cardState.get(A1);
    await recordNotUnderstood(db, A1, EVENING);

    expect(await db.cardState.get(A1)).toEqual(before);
    expect(await db.events.where('type').equals('not_understood').count()).toBe(1);
    expect(await affinity()).toBeUndefined();
  });

  it('none of the actions earns XP by itself', async () => {
    await setLiked(db, A1, true, EVENING);
    await setBookmarked(db, A1, true, EVENING);
    await markKnown(db, A1, EVENING);
    await setFlag(db, A1, 'Poznámka.', EVENING);

    expect((await db.character.get('me'))?.totalXp).toBe(0);
    expect(await db.daily.get(DAY)).toMatchObject({ cardsSeen: 0, xp: 0, newCards: 1 });
  });
});

describe('the learning day', () => {
  it('keeps learning after midnight in the same day', async () => {
    await recordSeen(db, A1, utc('2026-11-10T21:00:00')); // 22:00
    await recordRead(db, A1, utc('2026-11-10T23:30:00'), { newCard: true }); // 00:30 on the 11th
    await recordSeen(db, A2, utc('2026-11-11T02:30:00')); // 03:30 on the 11th

    expect(await db.daily.count()).toBe(1);
    expect(await db.daily.get(DAY)).toMatchObject({ newCards: 2, cardsSeen: 1 });
  });

  it('starts a fresh day, and a fresh streak, at 04:00', async () => {
    await recordSeen(db, A1, EVENING);
    await recordAnswer(db, answer(A1, { grade: null }), EVENING);
    await recordAnswer(db, answer(A1, { grade: null, countCard: false }), EVENING);
    expect((await db.daily.get(DAY))?.correctStreak).toBe(2);

    const morning = utc('2026-11-11T03:00:00'); // 04:00
    const result = await recordAnswer(db, answer(A1, { countCard: false }), morning);

    expect(result.correctStreak).toBe(1);
    expect(await db.daily.get('2026-11-11')).toMatchObject({ answers: 1, correctStreak: 1 });
    expect((await db.daily.get(DAY))?.answers).toBe(2);
  });
});

describe('active time', () => {
  it('adds up within the learning day', async () => {
    await addActiveSeconds(db, 12, EVENING);
    await addActiveSeconds(db, 30.5, EVENING);
    await addActiveSeconds(db, 0, EVENING);
    await addActiveSeconds(db, -4, EVENING);

    expect((await db.daily.get(DAY))?.activeSeconds).toBe(42.5);
  });
});

describe('before onboarding', () => {
  it('still records the day when there is no character yet', async () => {
    await db.character.clear();

    const reward = await recordRead(db, A1, EVENING, { newCard: true });

    expect(reward).toEqual({ xp: 5, level: 1, leveledUp: false, goalReached: false });
    expect(await db.daily.get(DAY)).toMatchObject({ cardsSeen: 1, xp: 5 });
    expect(await db.character.count()).toBe(0);
  });
});
