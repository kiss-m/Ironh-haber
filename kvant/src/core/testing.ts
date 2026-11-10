/**
 * Helpers for tests of the mixer and the session. Not used by the app.
 *
 * Content is described in a compact notation, one string per topic:
 *
 *   "C C4 F Q E2 M D1 C3!"
 *
 * Each token is a card: a letter for the type, an optional difficulty (default 3), and "!" for a
 * concept with an embedded quiz. C concept, F formula, N numeric (heavy); E example,
 * D did_you_know, M myth, V vocab (light); Q quiz (interactive).
 */
import type { CardType } from '../../shared/schema.ts';
import type { AttributeCode } from '../../shared/taxonomy.ts';
import {
  entryLoad,
  type FeedEntry,
  type FeedStep,
  type MixerCard,
  type MixerCategory,
  type MixerSnapshot,
  type MixerTopic,
} from './mixer.ts';

/** A small deterministic random source (mulberry32). */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPE_BY_LETTER: Record<string, CardType> = {
  C: 'concept',
  F: 'formula',
  N: 'numeric',
  E: 'example',
  D: 'did_you_know',
  M: 'myth',
  V: 'vocab',
  Q: 'quiz',
};

export interface TopicSpec {
  slug: string;
  cards: string;
  prerequisites?: string[];
  affinity?: number;
}

export interface CategorySpec {
  id: string;
  attribute?: AttributeCode;
  /** Default 50. Zero means not selected. */
  weight?: number;
  /** Default 3. */
  target?: number;
  topics: TopicSpec[];
}

export interface Content {
  categories: MixerCategory[];
  topics: MixerTopic[];
  cards: MixerCard[];
}

export function content(specs: readonly CategorySpec[]): Content {
  const categories: MixerCategory[] = [];
  const topics: MixerTopic[] = [];
  const cards: MixerCard[] = [];

  for (const spec of specs) {
    categories.push({
      id: spec.id,
      attribute: spec.attribute ?? 'T',
      weight: spec.weight ?? 50,
      difficultyTarget: spec.target ?? 3,
    });
    spec.topics.forEach((topicSpec, topicIndex) => {
      const topicId = `${spec.id}.${topicSpec.slug}`;
      topics.push({
        id: topicId,
        categoryId: spec.id,
        order: topicIndex + 1,
        prerequisites: topicSpec.prerequisites ?? [],
        affinity: topicSpec.affinity ?? 1,
      });
      topicSpec.cards
        .split(/\s+/)
        .filter(Boolean)
        .forEach((token, cardIndex) => {
          const type = TYPE_BY_LETTER[token.charAt(0)];
          if (!type) throw new Error(`Unknown card letter in "${token}"`);
          const difficulty = Number(/\d/.exec(token)?.[0] ?? 3);
          cards.push({
            id: `${topicId}.k${String(cardIndex + 1).padStart(2, '0')}`,
            topicId,
            categoryId: spec.id,
            type,
            difficulty,
            order: cardIndex + 1,
            hasQuiz: type === 'quiz' || type === 'myth' || token.endsWith('!'),
          });
        });
    });
  }
  return { categories, topics, cards };
}

export function snapshotOf(
  specs: readonly CategorySpec[],
  overrides: Partial<MixerSnapshot> = {},
): MixerSnapshot {
  return {
    ...content(specs),
    states: [],
    sharpness: { T: null, R: null, B: null, M: null, W: null, J: null },
    newCardsToday: 0,
    newCardCap: 40,
    serendipity: true,
    previous: [],
    pending: [],
    easier: {},
    ...overrides,
  };
}

/** What the order rules see in each entry. Entries of unknown cards are dropped. */
export function stepsOf(entries: readonly FeedEntry[], cards: readonly MixerCard[]): FeedStep[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return entries.flatMap((entry) => {
    const card = byId.get(entry.cardId);
    return card
      ? [
          {
            categoryId: card.categoryId,
            topicId: card.topicId,
            load: entryLoad(entry.source, card.type),
          },
        ]
      : [];
  });
}
