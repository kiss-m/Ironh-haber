/**
 * A compact, in-memory index of the content: what the mixer needs to know about every card,
 * without any of the text. It is read from IndexedDB once per content version and kept outside
 * React state. The feed loads full cards one by one, by id.
 */
import { hasQuiz } from '../core/cards.ts';
import type { MixerCard } from '../core/mixer.ts';
import type { KvantDb } from './db.ts';
import type { CardRow, CategoryRow, TopicRow } from './types.ts';

export interface ContentIndex {
  /** Categories that have at least one live card. */
  categories: CategoryRow[];
  topics: TopicRow[];
  /** Every live card. Archived cards are left out. */
  cards: MixerCard[];
  cardById: ReadonlyMap<string, MixerCard>;
  categoryById: ReadonlyMap<string, CategoryRow>;
}

export function toMixerCard(card: CardRow): MixerCard {
  return {
    id: card.id,
    topicId: card.topicId,
    categoryId: card.categoryId,
    type: card.type,
    difficulty: card.difficulty,
    order: card.order,
    hasQuiz: hasQuiz(card),
  };
}

const cache = new WeakMap<KvantDb, { version: string; index: ContentIndex }>();

/** The index for the content that is currently imported. Rebuilt only after an import. */
export async function loadContentIndex(db: KvantDb): Promise<ContentIndex> {
  const meta = await db.contentMeta.toArray();
  const version = meta
    .map((row) => `${row.packId}:${row.hash}:${row.importedAt}`)
    .sort()
    .join('|');
  const cached = cache.get(db);
  if (cached?.version === version) return cached.index;

  const cards: MixerCard[] = [];
  await db.cards.each((card) => {
    if (!card.archived) cards.push(toMixerCard(card));
  });

  const live = new Set(cards.map((card) => card.categoryId));
  const categories = (await db.categories.toArray())
    .filter((category) => live.has(category.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const liveTopics = new Set(cards.map((card) => card.topicId));
  const topics = (await db.topics.toArray()).filter((topic) => liveTopics.has(topic.id));

  const index: ContentIndex = {
    categories,
    topics,
    cards,
    cardById: new Map(cards.map((card) => [card.id, card])),
    categoryById: new Map(categories.map((category) => [category.id, category])),
  };
  cache.set(db, { version, index });
  return index;
}
