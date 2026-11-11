/** Builds the mixer's view of the world from IndexedDB. */
import { ATTRIBUTE_CODES, type AttributeCode } from '../../shared/taxonomy.ts';
import { AFFINITY } from '../core/config.ts';
import { learningDay, learningDayStart } from '../core/day.ts';
import type { FeedEntry, MixerCardState, MixerSnapshot } from '../core/mixer.ts';
import { sharpness, type SrsRecord } from '../core/srs.ts';
import { loadContentIndex } from './content.ts';
import type { KvantDb } from './db.ts';
import { loadSettings } from './profile.ts';

/** What the running feed session contributes to a snapshot. */
export interface SessionContext {
  /** The end of the queue, oldest first: at least the last three entries. */
  previous: readonly FeedEntry[];
  /** Entries that are queued but not shown yet. */
  pending: readonly FeedEntry[];
  /** topicId → difficulty of the card the reader did not understand. */
  easier: Readonly<Record<string, number>>;
}

export const NO_SESSION: SessionContext = { previous: [], pending: [], easier: {} };

/** Sharpness of every attribute: the mean retrievability of its rated cards, or null. */
export function sharpnessByAttribute(
  schedules: readonly { attribute: AttributeCode; srs: SrsRecord }[],
  now: Date,
): Record<AttributeCode, number | null> {
  const result = {} as Record<AttributeCode, number | null>;
  for (const code of ATTRIBUTE_CODES) {
    const own = schedules.filter((item) => item.attribute === code).map((item) => item.srs);
    result[code] = sharpness(own, now);
  }
  return result;
}

export async function buildSnapshot(
  db: KvantDb,
  now: Date,
  session: SessionContext = NO_SESSION,
): Promise<MixerSnapshot> {
  const [index, settings, affinities, difficulties, cardStates, daily] = await Promise.all([
    loadContentIndex(db),
    loadSettings(db),
    db.topicAffinity.toArray(),
    db.categoryDifficulty.toArray(),
    db.cardState.toArray(),
    db.daily.get(learningDay(now)),
  ]);

  const affinityByTopic = new Map(affinities.map((row) => [row.topicId, row.affinity]));
  const targetByCategory = new Map(difficulties.map((row) => [row.categoryId, row.target]));
  const dayStart = learningDayStart(learningDay(now)).getTime();

  const states: MixerCardState[] = [];
  const schedules: { attribute: AttributeCode; srs: SrsRecord }[] = [];
  for (const state of cardStates) {
    states.push({
      cardId: state.cardId,
      due: state.srs?.due ?? null,
      lastSeenAt: state.lastSeenAt,
      testedToday: state.lastAnsweredAt !== null && state.lastAnsweredAt >= dayStart,
    });
    const card = index.cardById.get(state.cardId);
    const category = card && index.categoryById.get(card.categoryId);
    if (category && state.srs) schedules.push({ attribute: category.attribute, srs: state.srs });
  }

  return {
    categories: index.categories.map((category) => ({
      id: category.id,
      attribute: category.attribute,
      weight: settings.categoryWeights[category.id] ?? 0,
      difficultyTarget: targetByCategory.get(category.id) ?? category.defaultDifficulty,
    })),
    topics: index.topics.map((topic) => ({
      id: topic.id,
      categoryId: topic.categoryId,
      order: topic.order,
      prerequisites: topic.prerequisites,
      affinity: affinityByTopic.get(topic.id) ?? AFFINITY.initial,
    })),
    cards: index.cards,
    states,
    sharpness: sharpnessByAttribute(schedules, now),
    newCardsToday: daily?.newCards ?? 0,
    newCardCap: settings.newCardCap,
    serendipity: settings.serendipity,
    previous: session.previous,
    pending: session.pending,
    easier: session.easier,
  };
}
