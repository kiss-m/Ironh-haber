import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONTENT_TABLES, DB_NAME, USER_TABLES, createDb, db as appDb, type KvantDb } from './db.ts';
import { GRADE, newSchedule } from '../core/srs.ts';
import type { CardRow, CardStateRow, DailyRow } from './types.ts';

/** A schedule that is due at the given moment. */
function dueAt(due: number) {
  return { ...newSchedule(new Date(0)), due };
}

function quizCard(id: string, order: number, patch: Partial<CardRow> = {}): CardRow {
  const [categoryId = '', topicSlug = ''] = id.split('.');
  return {
    id,
    topicId: `${categoryId}.${topicSlug}`,
    categoryId,
    type: 'quiz',
    difficulty: 2,
    order,
    title: `Karta ${order}`,
    tags: [],
    question: 'Otázka?',
    options: ['A', 'B', 'C'],
    correctIndex: 0,
    explanation: 'Vysvetlenie.',
    contentHash: 'a3f1c29b7e0d4a55',
    archived: false,
    ...patch,
  } as CardRow;
}

function cardState(cardId: string, patch: Partial<CardStateRow> = {}): CardStateRow {
  return {
    cardId,
    firstSeenAt: 1_000,
    lastSeenAt: 1_000,
    seenCount: 1,
    liked: false,
    bookmarked: false,
    known: false,
    flagged: null,
    srs: null,
    masteredAt: null,
    lastAnsweredAt: null,
    ...patch,
  };
}

function day(learningDay: string, xp: number): DailyRow {
  return {
    learningDay,
    cardsSeen: 0,
    newCards: 0,
    newCardsRead: 0,
    answers: 0,
    correct: 0,
    correctStreak: 0,
    xp,
    activeSeconds: 0,
    goalMet: false,
    quests: [],
  };
}

let db: KvantDb;

beforeEach(() => {
  db = createDb();
});

afterEach(async () => {
  await db.delete();
});

describe('database', () => {
  it('is the single database named "kvant", at schema version 1', async () => {
    expect(DB_NAME).toBe('kvant');
    expect(appDb.name).toBe('kvant');

    await db.open();
    expect(db.verno).toBe(1);
    // Dexie stores its version multiplied by ten.
    expect(await indexedDB.databases()).toEqual([{ name: 'kvant', version: 10 }]);
  });

  it('has exactly the content tables and the user tables', async () => {
    await db.open();
    const names = db.tables.map((table) => table.name).sort();
    expect(names).toEqual([...CONTENT_TABLES, ...USER_TABLES].sort());
    expect(names).toHaveLength(14);
    expect(
      CONTENT_TABLES.filter((name) => (USER_TABLES as readonly string[]).includes(name)),
    ).toEqual([]);
  });
});

describe('content tables', () => {
  beforeEach(async () => {
    await db.cards.bulkPut([
      quizCard('robotika.kinematika.c', 3),
      quizCard('robotika.kinematika.a', 1),
      quizCard('robotika.dynamika.x', 1),
      quizCard('robotika.kinematika.b', 2),
      quizCard('fyzika-mechanika.statika.y', 1),
    ]);
  });

  it('reads the cards of a topic in their order', async () => {
    const topic = 'robotika.kinematika';
    const cards = await db.cards
      .where('[topicId+order]')
      .between([topic, Dexie.minKey], [topic, Dexie.maxKey])
      .toArray();
    expect(cards.map((card) => card.id)).toEqual([
      'robotika.kinematika.a',
      'robotika.kinematika.b',
      'robotika.kinematika.c',
    ]);
  });

  it('finds cards by topic alone through the compound index', async () => {
    expect(await db.cards.where('topicId').equals('robotika.dynamika').primaryKeys()).toEqual([
      'robotika.dynamika.x',
    ]);
    expect(await db.cards.where({ topicId: 'robotika.kinematika' }).count()).toBe(3);
  });

  it('counts cards per category without loading them', async () => {
    expect(await db.cards.where('categoryId').equals('robotika').count()).toBe(4);
    expect(await db.cards.where('categoryId').equals('fyzika-mechanika').count()).toBe(1);
  });

  it('keeps a card of any type with its type-specific fields', async () => {
    const stored = await db.cards.get('robotika.kinematika.a');
    expect(stored?.type).toBe('quiz');
    if (stored?.type === 'quiz') {
      expect(stored.options).toEqual(['A', 'B', 'C']);
    }
  });

  it('replaces a card that is imported again', async () => {
    await db.cards.put(quizCard('robotika.kinematika.a', 1, { title: 'Nový nadpis' }));
    expect(await db.cards.count()).toBe(5);
    expect((await db.cards.get('robotika.kinematika.a'))?.title).toBe('Nový nadpis');
  });
});

describe('cardState indexes', () => {
  beforeEach(async () => {
    await db.cardState.bulkPut([
      cardState('a.t.new'),
      cardState('a.t.due-early', { srs: dueAt(5_000), lastSeenAt: 2_000 }),
      cardState('a.t.due-late', { srs: dueAt(9_000), lastSeenAt: 3_000 }),
      cardState('a.t.future', { srs: dueAt(50_000), lastSeenAt: 4_000 }),
      cardState('a.t.mastered', { srs: dueAt(90_000), masteredAt: 7_000 }),
    ]);
  });

  it('lists due reviews, most overdue first', async () => {
    const now = 10_000;
    const due = await db.cardState.where('srs.due').belowOrEqual(now).toArray();
    expect(due.map((state) => state.cardId)).toEqual(['a.t.due-early', 'a.t.due-late']);
    expect(await db.cardState.where('srs.due').belowOrEqual(now).count()).toBe(2);
  });

  it('leaves cards without a schedule out of the due index', async () => {
    const scheduled = await db.cardState.where('srs.due').above(0).primaryKeys();
    expect(scheduled).not.toContain('a.t.new');
    expect(scheduled).toHaveLength(4);
  });

  it('lists only mastered cards in the mastered index', async () => {
    expect(await db.cardState.where('masteredAt').above(0).primaryKeys()).toEqual(['a.t.mastered']);
  });

  it('finds the cards seen since a given moment', async () => {
    expect(await db.cardState.where('lastSeenAt').aboveOrEqual(3_000).primaryKeys()).toEqual([
      'a.t.due-late',
      'a.t.future',
    ]);
  });
});

describe('logs and daily rows', () => {
  it('numbers review log entries in insertion order', async () => {
    const first = await db.reviewLog.add({
      cardId: 'a.t.x',
      ts: 1_000,
      rating: GRADE.good,
      mode: 'feed',
      responseMs: 4_200,
    });
    const second = await db.reviewLog.add({
      cardId: 'a.t.y',
      ts: 2_000,
      rating: GRADE.again,
      mode: 'review',
      responseMs: 9_000,
    });
    expect(second).toBeGreaterThan(first);
    expect(await db.reviewLog.where('cardId').equals('a.t.y').count()).toBe(1);
    expect((await db.reviewLog.where('ts').above(1_500).first())?.cardId).toBe('a.t.y');
  });

  it('finds events by learning day and by type', async () => {
    await db.events.bulkAdd([
      { ts: 1, learningDay: '2026-11-09', type: 'card_seen', cardId: 'a.t.x' },
      { ts: 2, learningDay: '2026-11-09', type: 'answer', payload: { correct: true } },
      { ts: 3, learningDay: '2026-11-10', type: 'card_seen' },
    ]);
    expect(await db.events.where('learningDay').equals('2026-11-09').count()).toBe(2);
    expect(await db.events.where('type').equals('card_seen').count()).toBe(2);
  });

  it('reads a range of learning days in calendar order', async () => {
    await db.daily.bulkPut([day('2026-11-10', 30), day('2026-10-31', 10), day('2026-11-01', 20)]);
    const november = await db.daily
      .where('learningDay')
      .between('2026-11-01', '2026-11-30')
      .toArray();
    expect(november.map((row) => row.xp)).toEqual([20, 30]);
  });
});

describe('single-row tables', () => {
  it('stores the character and the settings under the id "me"', async () => {
    await db.character.put({
      id: 'me',
      name: 'Skúšobná postava',
      totalXp: 120,
      attributeXp: { T: 100, R: 0, B: 0, M: 20, W: 0, J: 0 },
      createdAt: 1_000,
    });
    await db.settings.put({
      id: 'me',
      categoryWeights: { robotika: 80 },
      dailyGoal: 20,
      newCardCap: 40,
      desiredRetention: 0.9,
      serendipity: true,
      streakEnabled: false,
      showGermanTerms: true,
      theme: 'dark',
      reminders: { enabled: false, times: [] },
    });

    expect((await db.character.get('me'))?.attributeXp.T).toBe(100);
    expect((await db.settings.get('me'))?.categoryWeights).toEqual({ robotika: 80 });
    expect(await db.character.count()).toBe(1);
  });
});
