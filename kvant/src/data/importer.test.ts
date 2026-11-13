import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuiltPack, ManifestEntry } from '../../shared/schema.ts';
import { GRADE, newSchedule } from '../core/srs.ts';
import { createDb, type KvantDb } from './db.ts';
import { importContent, type ContentSource } from './importer.ts';
import type { CardStateRow } from './types.ts';

const NOW = new Date('2026-11-10T18:00:00Z');
const LATER = new Date('2026-11-12T09:00:00Z');

/** A stand-in for a real digest: different text gives a different hex string. */
function fakeHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    a = Math.imul(a ^ text.charCodeAt(index), 16777619) >>> 0;
    b = Math.imul(b + text.charCodeAt(index), 2654435761) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

interface CardSpec {
  slug: string;
  title?: string;
  topic?: string;
}

/** A built pack with one quiz card per spec. */
function pack(packId: string, cards: CardSpec[], version = 1, topics = ['zaklady']): BuiltPack {
  return {
    schemaVersion: 1,
    packId,
    packVersion: version,
    language: 'sk',
    category: {
      id: packId,
      name: `Kategória ${packId}`,
      attribute: 'T',
      description: 'Opis.',
      color: '#4F8EF7',
      icon: 'bot',
      defaultDifficulty: 3,
    },
    topics: topics.map((slug, index) => ({
      id: `${packId}.${slug}`,
      name: `Téma ${slug}`,
      order: index + 1,
      prerequisites: [],
      description: 'Opis témy.',
    })),
    cards: cards.map((spec, index) => {
      const card = {
        id: `${packId}.${spec.topic ?? topics[0]!}.${spec.slug}`,
        topicId: `${packId}.${spec.topic ?? topics[0]!}`,
        type: 'quiz' as const,
        difficulty: 2,
        order: index + 1,
        title: spec.title ?? `Karta ${spec.slug}`,
        question: 'Otázka?',
        options: ['A', 'B', 'C'],
        correctIndex: 0,
        explanation: 'Vysvetlenie.',
        tags: [],
      };
      return { ...card, contentHash: fakeHash(JSON.stringify(card)) };
    }),
  };
}

/** A content directory held in memory. `loads` records every path that was requested. */
function memorySource(packs: BuiltPack[], overrides: Record<string, unknown> = {}) {
  const manifest: ManifestEntry[] = packs.map((item) => ({
    packId: item.packId,
    packVersion: item.packVersion,
    hash: fakeHash(JSON.stringify(item)),
    cardCount: item.cards.length,
  }));
  const files: Record<string, unknown> = { 'manifest.json': manifest };
  for (const item of packs) files[`packs/${item.packId}.json`] = item;
  Object.assign(files, overrides);

  const loads: string[] = [];
  const source: ContentSource = {
    load(path) {
      loads.push(path);
      if (!(path in files)) return Promise.reject(new Error(`404 ${path}`));
      return Promise.resolve(structuredClone(files[path]));
    },
  };
  return { source, loads };
}

function state(cardId: string, patch: Partial<CardStateRow> = {}): CardStateRow {
  return {
    cardId,
    firstSeenAt: 1_000,
    lastSeenAt: 2_000,
    seenCount: 3,
    liked: true,
    bookmarked: false,
    known: false,
    flagged: null,
    srs: newSchedule(NOW),
    masteredAt: null,
    lastAnsweredAt: null,
    ...patch,
  };
}

let db: KvantDb;

beforeEach(() => {
  db = createDb();
});

afterEach(async () => {
  await db.delete();
});

describe('first import', () => {
  it('writes categories, topics, cards and the pack bookkeeping', async () => {
    const robotika = pack('robotika', [{ slug: 'a' }, { slug: 'b' }]);
    const fyzika = pack('fyzika-mechanika', [{ slug: 'x' }]);
    const { source } = memorySource([robotika, fyzika]);

    const result = await importContent(db, source, NOW);

    expect(result).toEqual({
      imported: ['robotika', 'fyzika-mechanika'],
      unchanged: [],
      removed: [],
      failed: [],
    });
    expect((await db.categories.toArray()).map((category) => category.id).sort()).toEqual([
      'fyzika-mechanika',
      'robotika',
    ]);
    expect(await db.topics.get('robotika.zaklady')).toMatchObject({
      categoryId: 'robotika',
      name: 'Téma zaklady',
    });
    expect(await db.cards.count()).toBe(3);
    expect(await db.cards.get('robotika.zaklady.a')).toMatchObject({
      categoryId: 'robotika',
      topicId: 'robotika.zaklady',
      archived: false,
      contentHash: robotika.cards[0]!.contentHash,
    });
    expect(await db.contentMeta.get('robotika')).toMatchObject({
      packId: 'robotika',
      version: 1,
      importedAt: NOW.getTime(),
    });
  });

  it('throws on an invalid manifest and writes nothing', async () => {
    const { source } = memorySource([pack('robotika', [{ slug: 'a' }])], {
      'manifest.json': [{ packId: 'robotika' }],
    });
    await expect(importContent(db, source, NOW)).rejects.toThrow();
    expect(await db.cards.count()).toBe(0);
    expect(await db.contentMeta.count()).toBe(0);
  });

  it('throws when the manifest cannot be loaded', async () => {
    const source: ContentSource = { load: () => Promise.reject(new Error('offline')) };
    await expect(importContent(db, source, NOW)).rejects.toThrow('offline');
  });
});

describe('repeated import', () => {
  it('skips packs whose hash is unchanged, without even loading them', async () => {
    const packs = [pack('robotika', [{ slug: 'a' }]), pack('fyzika-mechanika', [{ slug: 'x' }])];
    await importContent(db, memorySource(packs).source, NOW);

    const second = memorySource(packs);
    const result = await importContent(db, second.source, LATER);

    expect(result.imported).toEqual([]);
    expect(result.unchanged).toEqual(['robotika', 'fyzika-mechanika']);
    expect(second.loads).toEqual(['manifest.json']);
    expect((await db.contentMeta.get('robotika'))?.importedAt).toBe(NOW.getTime());
  });

  it('loads only the pack that changed', async () => {
    const fyzika = pack('fyzika-mechanika', [{ slug: 'x' }]);
    await importContent(db, memorySource([pack('robotika', [{ slug: 'a' }]), fyzika]).source, NOW);

    const updated = pack('robotika', [{ slug: 'a', title: 'Nový názov' }], 2);
    const second = memorySource([updated, fyzika]);
    const result = await importContent(db, second.source, LATER);

    expect(result.imported).toEqual(['robotika']);
    expect(result.unchanged).toEqual(['fyzika-mechanika']);
    expect(second.loads).toEqual(['manifest.json', 'packs/robotika.json']);
    expect((await db.cards.get('robotika.zaklady.a'))?.title).toBe('Nový názov');
    expect(await db.contentMeta.get('robotika')).toMatchObject({
      version: 2,
      importedAt: LATER.getTime(),
    });
  });

  it('adds new cards and archives the ones that disappeared', async () => {
    await importContent(
      db,
      memorySource([pack('robotika', [{ slug: 'a' }, { slug: 'b' }])]).source,
      NOW,
    );
    const next = pack('robotika', [{ slug: 'a' }, { slug: 'c' }], 2);

    await importContent(db, memorySource([next]).source, LATER);

    expect(await db.cards.count()).toBe(3);
    expect((await db.cards.get('robotika.zaklady.a'))?.archived).toBe(false);
    expect((await db.cards.get('robotika.zaklady.c'))?.archived).toBe(false);
    // Archived, not deleted: the reader's state may still point at it.
    expect(await db.cards.get('robotika.zaklady.b')).toMatchObject({
      archived: true,
      title: 'Karta b',
    });
  });

  it('brings an archived card back when it returns to the pack', async () => {
    const both = pack('robotika', [{ slug: 'a' }, { slug: 'b' }]);
    await importContent(db, memorySource([both]).source, NOW);
    await importContent(db, memorySource([pack('robotika', [{ slug: 'a' }], 2)]).source, LATER);
    expect((await db.cards.get('robotika.zaklady.b'))?.archived).toBe(true);

    await importContent(db, memorySource([{ ...both, packVersion: 3 }]).source, LATER);

    expect((await db.cards.get('robotika.zaklady.b'))?.archived).toBe(false);
  });

  it('removes topics that left the pack and keeps the others', async () => {
    const first = pack('robotika', [{ slug: 'a' }, { slug: 'k', topic: 'kinematika' }], 1, [
      'zaklady',
      'kinematika',
    ]);
    await importContent(db, memorySource([first]).source, NOW);
    expect(await db.topics.count()).toBe(2);

    await importContent(db, memorySource([pack('robotika', [{ slug: 'a' }], 2)]).source, LATER);

    expect((await db.topics.toArray()).map((topic) => topic.id)).toEqual(['robotika.zaklady']);
    expect((await db.cards.get('robotika.kinematika.k'))?.archived).toBe(true);
  });

  it('archives the cards of a pack that left the manifest', async () => {
    const robotika = pack('robotika', [{ slug: 'a' }]);
    await importContent(
      db,
      memorySource([robotika, pack('fyzika-mechanika', [{ slug: 'x' }, { slug: 'y' }])]).source,
      NOW,
    );

    const result = await importContent(db, memorySource([robotika]).source, LATER);

    expect(result.removed).toEqual(['fyzika-mechanika']);
    expect(await db.contentMeta.get('fyzika-mechanika')).toBeUndefined();
    const cards = await db.cards.where('categoryId').equals('fyzika-mechanika').toArray();
    expect(cards.map((card) => card.archived)).toEqual([true, true]);
    expect((await db.cards.get('robotika.zaklady.a'))?.archived).toBe(false);
    // The category stays, so archived cards can still be shown with their colours.
    expect(await db.categories.get('fyzika-mechanika')).toBeDefined();
  });
});

describe('a broken pack', () => {
  it('is skipped and reported, while the other packs are imported', async () => {
    const robotika = pack('robotika', [{ slug: 'a' }]);
    const { source } = memorySource([robotika, pack('fyzika-mechanika', [{ slug: 'x' }])], {
      'packs/fyzika-mechanika.json': { schemaVersion: 1, packId: 'fyzika-mechanika' },
    });

    const result = await importContent(db, source, NOW);

    expect(result.imported).toEqual(['robotika']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.packId).toBe('fyzika-mechanika');
    expect(await db.cards.count()).toBe(1);
    expect(await db.contentMeta.get('fyzika-mechanika')).toBeUndefined();
  });

  it('leaves the previous version of that pack in place', async () => {
    await importContent(db, memorySource([pack('robotika', [{ slug: 'a' }])]).source, NOW);
    const next = pack('robotika', [{ slug: 'a', title: 'Nový názov' }], 2);
    const { source } = memorySource([next], { 'packs/robotika.json': 'not a pack' });

    const result = await importContent(db, source, LATER);

    expect(result.failed.map((failure) => failure.packId)).toEqual(['robotika']);
    expect((await db.cards.get('robotika.zaklady.a'))?.title).toBe('Karta a');
    expect((await db.contentMeta.get('robotika'))?.version).toBe(1);
  });

  it('is reported when its file is missing or holds another pack', async () => {
    const robotika = pack('robotika', [{ slug: 'a' }]);
    const fyzika = pack('fyzika-mechanika', [{ slug: 'x' }]);
    const swapped = memorySource([robotika, fyzika], { 'packs/robotika.json': fyzika });

    const result = await importContent(db, swapped.source, NOW);

    expect(result.failed).toEqual([
      {
        packId: 'robotika',
        reason: 'the file for "robotika" contains the pack "fyzika-mechanika"',
      },
    ]);
    expect(result.imported).toEqual(['fyzika-mechanika']);
  });

  it('is retried on the next import', async () => {
    const robotika = pack('robotika', [{ slug: 'a' }]);
    await importContent(db, memorySource([robotika], { 'packs/robotika.json': null }).source, NOW);
    expect(await db.cards.count()).toBe(0);

    const result = await importContent(db, memorySource([robotika]).source, LATER);

    expect(result.imported).toEqual(['robotika']);
    expect(await db.cards.count()).toBe(1);
  });
});

describe('user state', () => {
  beforeEach(async () => {
    await importContent(
      db,
      memorySource([pack('robotika', [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }])]).source,
      NOW,
    );
  });

  it('is never touched by an import', async () => {
    const states = [
      state('robotika.zaklady.a'),
      state('robotika.zaklady.b', { bookmarked: true, masteredAt: 5_000 }),
    ];
    await db.cardState.bulkPut(states);
    await db.reviewLog.add({
      cardId: 'robotika.zaklady.a',
      ts: 3_000,
      rating: GRADE.good,
      mode: 'feed',
      responseMs: 4_000,
    });
    await db.character.put({
      id: 'me',
      name: 'Skúšobná postava',
      totalXp: 420,
      attributeXp: { T: 400, R: 0, B: 0, M: 0, W: 20, J: 0 },
      createdAt: 1_000,
    });
    await db.topicAffinity.put({ topicId: 'robotika.zaklady', affinity: 1.3 });

    // Card a is rewritten, card b disappears, card c stays, card d is new.
    const next = pack(
      'robotika',
      [{ slug: 'a', title: 'Prepísaná' }, { slug: 'c' }, { slug: 'd' }],
      2,
    );
    await importContent(db, memorySource([next]).source, LATER);

    expect(await db.cardState.toArray()).toEqual(states);
    expect(await db.reviewLog.count()).toBe(1);
    expect((await db.character.get('me'))?.totalXp).toBe(420);
    expect((await db.topicAffinity.get('robotika.zaklady'))?.affinity).toBe(1.3);
  });

  it('unflags a flagged card whose content changed', async () => {
    const flag = { at: 4_000, note: 'Preklep v otázke.' };
    await db.cardState.bulkPut([
      state('robotika.zaklady.a', { flagged: flag }),
      state('robotika.zaklady.b', { flagged: flag }),
    ]);

    // Only card a is rewritten.
    const next = pack(
      'robotika',
      [{ slug: 'a', title: 'Opravená' }, { slug: 'b' }, { slug: 'c' }],
      2,
    );
    await importContent(db, memorySource([next]).source, LATER);

    const fixed = await db.cardState.get('robotika.zaklady.a');
    expect(fixed?.flagged).toBeNull();
    // Everything else about the reader's state of that card stays.
    expect(fixed).toEqual({ ...state('robotika.zaklady.a'), flagged: null });
    expect((await db.cardState.get('robotika.zaklady.b'))?.flagged).toEqual(flag);
  });

  it('keeps the flag of a card that was only archived', async () => {
    const flag = { at: 4_000, note: 'Zastarané.' };
    await db.cardState.put(state('robotika.zaklady.b', { flagged: flag }));

    await importContent(
      db,
      memorySource([pack('robotika', [{ slug: 'a' }, { slug: 'c' }], 2)]).source,
      LATER,
    );

    expect((await db.cardState.get('robotika.zaklady.b'))?.flagged).toEqual(flag);
  });
});
