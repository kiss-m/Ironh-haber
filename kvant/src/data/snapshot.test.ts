import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuiltPack } from '../../shared/schema.ts';
import { buildBatch } from '../core/mixer.ts';
import { GRADE, retrievability } from '../core/srs.ts';
import { seededRng } from '../core/testing.ts';
import { loadContentIndex } from './content.ts';
import { createDb, type KvantDb } from './db.ts';
import { importContent, type ContentSource } from './importer.ts';
import {
  createProfile,
  defaultSettings,
  loadSettings,
  updateSettings,
  weightsFor,
} from './profile.ts';
import { recordAnswer, recordSeen, setLiked } from './progress.ts';
import { buildSnapshot, sharpnessByAttribute } from './snapshot.ts';

function utc(iso: string): Date {
  return new Date(`${iso}Z`);
}

const EVENING = utc('2026-11-10T18:00:00');
const NEXT_EVENING = utc('2026-11-11T18:00:00');

function filler(words: number): string {
  return Array.from({ length: words }, () => 'slovo').join(' ');
}

/** A built pack with a quiz, a concept that carries a quiz, and an example in each topic. */
function pack(packId: string, attribute: 'T' | 'W', topics: string[], difficulty = 3): BuiltPack {
  const common = { difficulty, tags: [], contentHash: 'a3f1c29b7e0d4a55' };
  const quiz = {
    question: 'Otázka?',
    options: ['A', 'B', 'C'],
    correctIndex: 0,
    explanation: 'Lebo.',
  };
  return {
    schemaVersion: 1,
    packId,
    packVersion: 1,
    language: 'sk',
    category: {
      id: packId,
      name: packId,
      attribute,
      description: 'Opis.',
      color: '#4F8EF7',
      icon: 'bot',
      defaultDifficulty: difficulty,
    },
    topics: topics.map((slug, index) => ({
      id: `${packId}.${slug}`,
      name: slug,
      order: index + 1,
      prerequisites: index === 0 ? [] : [`${packId}.${topics[0]!}`],
      description: 'Opis.',
    })),
    cards: topics.flatMap((slug) => {
      const topicId = `${packId}.${slug}`;
      return [
        {
          ...common,
          id: `${topicId}.kviz`,
          topicId,
          type: 'quiz' as const,
          order: 1,
          title: 'Kvíz',
          ...quiz,
        },
        {
          ...common,
          id: `${topicId}.koncept`,
          topicId,
          type: 'concept' as const,
          order: 2,
          title: 'Koncept',
          body: filler(40),
          simple: filler(5),
          recall: { q: 'Otázka?', a: 'Odpoveď.' },
          quiz,
        },
        {
          ...common,
          id: `${topicId}.priklad`,
          topicId,
          type: 'example' as const,
          order: 3,
          title: 'Príklad',
          body: filler(30),
          recall: { q: 'Otázka?', a: 'Odpoveď.' },
        },
      ];
    }),
  };
}

function sourceOf(packs: BuiltPack[]): ContentSource {
  const files: Record<string, unknown> = {
    'manifest.json': packs.map((item) => ({
      packId: item.packId,
      packVersion: item.packVersion,
      hash:
        `${item.packVersion}`.padStart(8, '0') + item.cards.length.toString(16).padStart(8, '0'),
      cardCount: item.cards.length,
    })),
  };
  for (const item of packs) files[`packs/${item.packId}.json`] = item;
  return { load: (path) => Promise.resolve(structuredClone(files[path])) };
}

let db: KvantDb;

beforeEach(async () => {
  db = createDb();
  await importContent(
    db,
    sourceOf([
      pack('robotika', 'T', ['zaklady', 'kinematika']),
      pack('ako-veci-funguju', 'W', ['v-kuchyni'], 2),
    ]),
    EVENING,
  );
  await createProfile(
    db,
    { name: 'Postava', categoryWeights: { robotika: 80 }, dailyGoal: 20, theme: 'dark' },
    EVENING,
  );
});

afterEach(async () => {
  await db.delete();
});

describe('content index', () => {
  it('lists live cards with what the mixer needs to know', async () => {
    const index = await loadContentIndex(db);

    expect(index.cards).toHaveLength(9);
    expect(index.cardById.get('robotika.zaklady.koncept')).toEqual({
      id: 'robotika.zaklady.koncept',
      topicId: 'robotika.zaklady',
      categoryId: 'robotika',
      type: 'concept',
      difficulty: 3,
      order: 2,
      hasQuiz: true,
    });
    expect(index.cardById.get('robotika.zaklady.priklad')?.hasQuiz).toBe(false);
    expect(index.categories.map((category) => category.id)).toEqual([
      'ako-veci-funguju',
      'robotika',
    ]);
    expect(index.topics).toHaveLength(3);
  });

  it('is reused until the content changes', async () => {
    const first = await loadContentIndex(db);
    expect(await loadContentIndex(db)).toBe(first);

    // A new version of a pack: one topic fewer.
    await importContent(
      db,
      sourceOf([
        { ...pack('robotika', 'T', ['zaklady']), packVersion: 2 },
        pack('ako-veci-funguju', 'W', ['v-kuchyni'], 2),
      ]),
      NEXT_EVENING,
    );
    const second = await loadContentIndex(db);
    expect(second).not.toBe(first);
    expect(second.cards).toHaveLength(6);
    // The archived cards and their topic are gone from the index.
    expect(second.cardById.has('robotika.kinematika.kviz')).toBe(false);
    expect(second.topics.map((topic) => topic.id).sort()).toEqual([
      'ako-veci-funguju.v-kuchyni',
      'robotika.zaklady',
    ]);
  });

  it('leaves out a category whose cards are all archived', async () => {
    await importContent(
      db,
      sourceOf([pack('robotika', 'T', ['zaklady', 'kinematika'])]),
      NEXT_EVENING,
    );

    const index = await loadContentIndex(db);
    expect(index.categories.map((category) => category.id)).toEqual(['robotika']);
    expect(await db.categories.count()).toBe(2);
  });
});

describe('buildSnapshot', () => {
  it('describes categories with their weight and difficulty target', async () => {
    const snapshot = await buildSnapshot(db, EVENING);

    expect(snapshot.categories).toEqual([
      { id: 'ako-veci-funguju', attribute: 'W', weight: 0, difficultyTarget: 2 },
      { id: 'robotika', attribute: 'T', weight: 80, difficultyTarget: 3 },
    ]);
    expect(snapshot).toMatchObject({
      newCardsToday: 0,
      newCardCap: 40,
      serendipity: true,
      previous: [],
      pending: [],
      easier: {},
      states: [],
      sharpness: { T: null, R: null, B: null, M: null, W: null, J: null },
    });
  });

  it('carries topics with prerequisites and the default affinity', async () => {
    const snapshot = await buildSnapshot(db, EVENING);

    expect(snapshot.topics.find((topic) => topic.id === 'robotika.kinematika')).toEqual({
      id: 'robotika.kinematika',
      categoryId: 'robotika',
      order: 2,
      prerequisites: ['robotika.zaklady'],
      affinity: 1,
    });
  });

  it('picks up the stored affinity, difficulty target and settings', async () => {
    await recordSeen(db, 'robotika.zaklady.kviz', EVENING);
    await setLiked(db, 'robotika.zaklady.kviz', true, EVENING);
    await db.categoryDifficulty.put({
      categoryId: 'robotika',
      target: 4,
      recent: [],
      answersSinceAdjust: 0,
    });
    await updateSettings(db, { newCardCap: 25, serendipity: false });

    const snapshot = await buildSnapshot(db, EVENING);

    expect(snapshot.topics.find((topic) => topic.id === 'robotika.zaklady')?.affinity).toBe(1.15);
    expect(
      snapshot.categories.find((category) => category.id === 'robotika')?.difficultyTarget,
    ).toBe(4);
    expect(snapshot.newCardCap).toBe(25);
    expect(snapshot.serendipity).toBe(false);
  });

  it('reports seen cards with their due moment', async () => {
    await recordSeen(db, 'robotika.zaklady.kviz', EVENING);

    const snapshot = await buildSnapshot(db, EVENING);

    expect(snapshot.states).toEqual([
      {
        cardId: 'robotika.zaklady.kviz',
        due: utc('2026-11-11T03:00:00').getTime(),
        lastSeenAt: EVENING.getTime(),
        testedToday: false,
      },
    ]);
    expect(snapshot.newCardsToday).toBe(1);
  });

  it('knows which cards were answered during the current learning day', async () => {
    const card = 'robotika.zaklady.kviz';
    await recordSeen(db, card, EVENING);
    await recordAnswer(
      db,
      {
        cardId: card,
        correct: true,
        responseMs: 1,
        grade: null,
        mode: 'feed',
        countCard: true,
        newCard: true,
      },
      EVENING,
    );

    const tested = async (now: Date) => (await buildSnapshot(db, now)).states[0]?.testedToday;
    expect(await tested(EVENING)).toBe(true);
    expect(await tested(utc('2026-11-11T02:30:00'))).toBe(true); // 03:30, still the same day
    expect(await tested(utc('2026-11-11T03:00:00'))).toBe(false); // 04:00, a new day
  });

  it('counts new cards per learning day', async () => {
    await recordSeen(db, 'robotika.zaklady.kviz', EVENING);
    await recordSeen(db, 'robotika.zaklady.koncept', EVENING);

    expect((await buildSnapshot(db, EVENING)).newCardsToday).toBe(2);
    expect((await buildSnapshot(db, NEXT_EVENING)).newCardsToday).toBe(0);
  });

  it('computes sharpness per attribute from rated cards only', async () => {
    const rated = 'robotika.zaklady.kviz';
    await recordSeen(db, rated, EVENING);
    await recordSeen(db, 'robotika.zaklady.koncept', EVENING);
    await recordSeen(db, 'ako-veci-funguju.v-kuchyni.kviz', EVENING);
    await recordAnswer(
      db,
      {
        cardId: rated,
        correct: true,
        responseMs: 1,
        grade: GRADE.good,
        mode: 'feed',
        countCard: true,
        newCard: false,
      },
      NEXT_EVENING,
    );

    const later = utc('2026-11-20T18:00:00');
    const snapshot = await buildSnapshot(db, later);

    const schedule = (await db.cardState.get(rated))!.srs!;
    expect(snapshot.sharpness.T).toBeCloseTo(retrievability(schedule, later), 10);
    expect(snapshot.sharpness.T).toBeLessThan(1);
    // Cards of attribute W were only read, never rated.
    expect(snapshot.sharpness.W).toBeNull();
  });

  it('passes the session context through', async () => {
    const pending = [{ cardId: 'robotika.zaklady.kviz', source: 'new' as const }];
    const snapshot = await buildSnapshot(db, EVENING, {
      previous: pending,
      pending,
      easier: { 'robotika.zaklady': 4 },
    });

    expect(snapshot.previous).toEqual(pending);
    expect(snapshot.pending).toEqual(pending);
    expect(snapshot.easier).toEqual({ 'robotika.zaklady': 4 });
  });

  it('feeds the mixer: a first batch from the selected category, with a surprise from the other', async () => {
    const batch = buildBatch(await buildSnapshot(db, EVENING), EVENING, seededRng(1));

    expect(batch.length).toBeGreaterThan(0);
    const surprises = batch.filter((entry) => entry.source === 'serendipity');
    expect(surprises.every((entry) => entry.cardId.startsWith('ako-veci-funguju.'))).toBe(true);
    const fresh = batch.filter((entry) => entry.source === 'new');
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((entry) => entry.cardId.startsWith('robotika.'))).toBe(true);
    // The second topic stays locked until half of the first has been seen.
    expect(fresh.every((entry) => entry.cardId.startsWith('robotika.zaklady.'))).toBe(true);
  });
});

describe('sharpnessByAttribute', () => {
  it('returns null for every attribute without rated cards', () => {
    expect(sharpnessByAttribute([], EVENING)).toEqual({
      T: null,
      R: null,
      B: null,
      M: null,
      W: null,
      J: null,
    });
  });
});

describe('profile', () => {
  it('creates the character at zero and the settings with defaults', async () => {
    expect(await db.character.get('me')).toEqual({
      id: 'me',
      name: 'Postava',
      totalXp: 0,
      attributeXp: { T: 0, R: 0, B: 0, M: 0, W: 0, J: 0 },
      createdAt: EVENING.getTime(),
    });
    expect(await db.settings.get('me')).toEqual({
      ...defaultSettings('dark'),
      categoryWeights: { robotika: 80 },
      dailyGoal: 20,
    });
  });

  it('trims the name', async () => {
    await createProfile(
      db,
      { name: '  Ada  ', categoryWeights: {}, dailyGoal: 10, theme: 'light' },
      EVENING,
    );
    expect((await db.character.get('me'))?.name).toBe('Ada');
    expect((await db.settings.get('me'))?.theme).toBe('light');
  });

  it('has the defaults of the spec', () => {
    expect(defaultSettings()).toEqual({
      id: 'me',
      categoryWeights: {},
      dailyGoal: 20,
      newCardCap: 40,
      desiredRetention: 0.9,
      serendipity: true,
      streakEnabled: false,
      showGermanTerms: true,
      theme: 'dark',
      reminders: { enabled: false, times: [] },
    });
  });

  it('gives every selected category the default weight', () => {
    expect(weightsFor(['robotika', 'nemcina'])).toEqual({ robotika: 50, nemcina: 50 });
  });

  it('updates single settings and keeps the rest', async () => {
    await updateSettings(db, { dailyGoal: 40 });

    expect(await loadSettings(db)).toMatchObject({
      dailyGoal: 40,
      categoryWeights: { robotika: 80 },
    });
  });

  it('falls back to defaults before onboarding', async () => {
    await db.settings.clear();
    expect(await loadSettings(db)).toEqual(defaultSettings());
  });
});
