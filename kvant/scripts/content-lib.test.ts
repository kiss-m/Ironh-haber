import { describe, expect, it } from 'vitest';
import { builtPackSchema, type Pack } from '../shared/schema.ts';
import {
  buildPack,
  canonicalJson,
  digest,
  manifestEntry,
  serializePack,
  validatePack,
} from './content-lib.ts';

function filler(words: number): string {
  return Array.from({ length: words }, () => 'slovo').join(' ');
}

const PACK: Pack = {
  schemaVersion: 1,
  packId: 'robotika',
  packVersion: 3,
  language: 'sk',
  category: {
    id: 'robotika',
    name: 'Robotika',
    attribute: 'T',
    description: 'Kinematika a trajektórie.',
    color: '#4F8EF7',
    icon: 'bot',
    defaultDifficulty: 3,
  },
  topics: [
    {
      id: 'robotika.zaklady',
      name: 'Základy',
      order: 1,
      prerequisites: [],
      description: 'Úvod.',
    },
  ],
  cards: [
    {
      id: 'robotika.zaklady.priklad',
      topicId: 'robotika.zaklady',
      type: 'example',
      difficulty: 2,
      order: 1,
      title: 'Príklad',
      body: filler(30),
      recall: { q: 'Otázka?', a: 'Odpoveď.' },
      tags: [],
    },
    {
      id: 'robotika.zaklady.kviz',
      topicId: 'robotika.zaklady',
      type: 'quiz',
      difficulty: 2,
      order: 2,
      title: 'Kvíz',
      question: 'Koľko?',
      options: ['Jeden', 'Dva', 'Tri'],
      correctIndex: 1,
      explanation: 'Lebo dva.',
      tags: [],
    },
  ],
};

describe('canonicalJson', () => {
  it('does not depend on the order of keys', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(
      canonicalJson({ a: { c: 'x', d: [1, 2] }, b: 1 }),
    );
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('keeps the order of arrays, which is content', () => {
    expect(canonicalJson(['b', 'a'])).not.toBe(canonicalJson(['a', 'b']));
  });

  it('ignores undefined members, as JSON does', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('digest', () => {
  it('is a stable 16-digit lowercase hex string', () => {
    expect(digest('kvant')).toMatch(/^[0-9a-f]{16}$/);
    expect(digest('kvant')).toBe(digest('kvant'));
    expect(digest('kvant')).not.toBe(digest('Kvant'));
  });
});

describe('buildPack', () => {
  it('gives every card a content hash and yields a valid built pack', () => {
    const built = buildPack(PACK);
    expect(builtPackSchema.safeParse(built).success).toBe(true);
    expect(built.cards.map((card) => card.contentHash)).toHaveLength(2);
    expect(new Set(built.cards.map((card) => card.contentHash)).size).toBe(2);
    // The source pack is not modified.
    expect('contentHash' in PACK.cards[0]!).toBe(false);
  });

  it('changes the hash of a card exactly when its content changes', () => {
    const before = buildPack(PACK);
    const edited = structuredClone(PACK);
    edited.cards[1]!.title = 'Iný názov';
    const after = buildPack(edited);
    expect(after.cards[0]!.contentHash).toBe(before.cards[0]!.contentHash);
    expect(after.cards[1]!.contentHash).not.toBe(before.cards[1]!.contentHash);
  });

  it('does not change a hash when only the order of keys differs', () => {
    const reordered = structuredClone(PACK);
    const { id, ...rest } = reordered.cards[0]!;
    reordered.cards[0] = { ...rest, id };
    expect(buildPack(reordered).cards[0]!.contentHash).toBe(buildPack(PACK).cards[0]!.contentHash);
  });
});

describe('manifestEntry', () => {
  it('describes the built file', () => {
    const built = buildPack(PACK);
    const text = serializePack(built);
    expect(manifestEntry(built, text)).toEqual({
      packId: 'robotika',
      packVersion: 3,
      hash: digest(text),
      cardCount: 2,
    });
    expect(JSON.parse(text)).toEqual(built);
  });

  it('changes its hash whenever any card changes', () => {
    const edited = structuredClone(PACK);
    edited.cards[0]!.tags = ['nový'];
    const a = buildPack(PACK);
    const b = buildPack(edited);
    expect(manifestEntry(a, serializePack(a)).hash).not.toBe(
      manifestEntry(b, serializePack(b)).hash,
    );
  });
});

describe('validatePack', () => {
  it('accepts a valid pack named after its id', () => {
    expect(validatePack(PACK, 'robotika.json')).toEqual({ ok: true, pack: PACK });
  });

  it('rejects a file that is not named after the pack', () => {
    expect(validatePack(PACK, 'roboty.json')).toEqual({
      ok: false,
      errors: ['the file must be named robotika.json, after its packId'],
    });
  });

  it('rejects a category the taxonomy does not know', () => {
    const unknown = structuredClone(PACK);
    unknown.packId = 'alchymia';
    unknown.category.id = 'alchymia';
    unknown.topics[0]!.id = 'alchymia.zaklady';
    unknown.cards = [];
    expect(validatePack(unknown, 'alchymia.json')).toEqual({
      ok: false,
      errors: ['"alchymia" is not a category in shared/taxonomy.ts'],
    });
  });

  it('rejects a category whose name or attribute differs from the taxonomy', () => {
    const wrong = structuredClone(PACK);
    wrong.category.name = 'Roboty';
    wrong.category.attribute = 'W';
    expect(validatePack(wrong, 'robotika.json')).toEqual({
      ok: false,
      errors: [
        'category.name must be "Robotika", as in shared/taxonomy.ts',
        'category.attribute must be "T", as in shared/taxonomy.ts',
      ],
    });
  });

  it('reports schema errors with the id of the card they belong to', () => {
    const broken = structuredClone(PACK) as unknown as { cards: Record<string, unknown>[] };
    broken.cards[0]!.body = filler(5);
    broken.cards[1]!.correctIndex = 7;
    expect(validatePack(broken, 'robotika.json')).toEqual({
      ok: false,
      errors: [
        'cards[0] (robotika.zaklady.priklad).body: too short: 5 words, expected at least 30',
        'cards[1] (robotika.zaklady.kviz).correctIndex: correctIndex 7 is out of range for 3 options',
      ],
    });
  });
});
