/**
 * The feed mixer (docs/SPEC.md section 8): decides which cards come next.
 *
 * `buildBatch` is a pure function of a snapshot of the reader's state, the time and a random
 * source, so the same inputs always give the same batch.
 *
 * A batch has ten slots: six new cards, three retrievals and one serendipity card (four, five and
 * one when more than 30 reviews are due). Every slot has a chain of fallbacks, so a slot is only
 * left empty when there is truly nothing to show.
 *
 * Three rules shape the order: at most two cards in a row from one category, never the same topic
 * twice in a row, at most three heavy cards in a row. They always hold while any card satisfies
 * them, be it a new card, a review or a surprise. Only when no such card exists (a single selected
 * category, or the first minutes of the first day, when every topic still opens with a concept
 * and there is nothing to review yet) are they given up rather than ending the feed: one at a
 * time and in that order, so the limit on heavy cards is the last to go. A light card from the
 * topic just shown is a gentler exception than a fourth dense card in a row.
 */
import { CARD_LOAD, type CardLoad, type CardType } from '../../shared/schema.ts';
import type { AttributeCode } from '../../shared/taxonomy.ts';
import {
  BACKLOG_SLOTS,
  BACKLOG_THRESHOLD,
  BATCH_SLOTS,
  DIFFICULTY_TOLERANCE,
  IN_PROGRESS_TOPIC_BOOST,
  MAX_CATEGORY_RUN,
  MAX_HEAVY_RUN,
  PREREQUISITE_SEEN_SHARE,
  RECENT_QUIZ_WINDOW_HOURS,
  RUSTY_SHARPNESS,
  SERENDIPITY_MAX_DIFFICULTY,
} from './config.ts';

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

/** What the mixer knows about a card. No text: the feed loads that for the cards it shows. */
export interface MixerCard {
  id: string;
  topicId: string;
  categoryId: string;
  type: CardType;
  difficulty: number;
  order: number;
  /** A review of the card is a question with a right answer: a quiz, embedded quiz or myth. */
  hasQuiz: boolean;
}

export interface MixerTopic {
  id: string;
  categoryId: string;
  order: number;
  prerequisites: readonly string[];
  /** 0.5–2.0, see affinity.ts. */
  affinity: number;
}

export interface MixerCategory {
  id: string;
  attribute: AttributeCode;
  /** 0–100. Zero means the reader has not selected the category. */
  weight: number;
  /** The adaptive difficulty target, 1–5. */
  difficultyTarget: number;
}

/** The state of a card the reader has seen at least once. */
export interface MixerCardState {
  cardId: string;
  /** Epoch ms from which a review is due, or null if the card has no schedule. */
  due: number | null;
  lastSeenAt: number;
  /** Whether the card was already answered during the current learning day. */
  testedToday: boolean;
}

/**
 * Why a card is in the feed.
 *
 *   new          first reading, picked by category weight and topic affinity
 *   serendipity  first reading of a light card from a category the reader did not select
 *   due          retrieval of a card whose review is due
 *   recent       retrieval of a recently seen card, when nothing is due
 *   repeat       second reading after "Nerozumiem" (added by session.ts, never by the mixer)
 */
export type FeedSource = 'new' | 'serendipity' | 'due' | 'recent' | 'repeat';

export interface FeedEntry {
  cardId: string;
  source: FeedSource;
}

export interface MixerSnapshot {
  categories: readonly MixerCategory[];
  topics: readonly MixerTopic[];
  /** Every live card. Archived cards are left out. */
  cards: readonly MixerCard[];
  states: readonly MixerCardState[];
  /** Sharpness per attribute from 0 to 1, or null while nothing in it has been rated. */
  sharpness: Readonly<Record<AttributeCode, number | null>>;
  /** New cards the reader has already seen during the current learning day. */
  newCardsToday: number;
  newCardCap: number;
  serendipity: boolean;
  /** The end of the feed so far, oldest first. The order rules look back at it. */
  previous: readonly FeedEntry[];
  /** Entries that are queued but not shown yet. Their cards are not picked a second time. */
  pending: readonly FeedEntry[];
  /** Topics where the reader tapped "Nerozumiem", with the difficulty of the card in question. */
  easier: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** A first reading, as opposed to a retrieval or a repeat. */
export function isFirstReading(source: FeedSource): boolean {
  return source === 'new' || source === 'serendipity';
}

/** A retrieval: the answer is graded into the card's schedule. */
export function isRetrieval(source: FeedSource): boolean {
  return source === 'due' || source === 'recent';
}

/** How demanding an entry is. A retrieval is a question, whatever the card's own type. */
export function entryLoad(source: FeedSource, type: CardType): CardLoad {
  return isRetrieval(source) ? 'interactive' : CARD_LOAD[type];
}

/** Picks an item with probability proportional to its weight. */
export function pickWeighted<T>(
  items: readonly T[],
  weight: (item: T) => number,
  rng: () => number,
): T | undefined {
  const weights = items.map((item) => Math.max(0, weight(item)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (items.length === 0) return undefined;
  if (total <= 0) return items[0];
  let threshold = rng() * total;
  for (let index = 0; index < items.length; index += 1) {
    threshold -= weights[index] ?? 0;
    if (threshold < 0) return items[index];
  }
  return items[items.length - 1];
}

function byOrderThenId<T extends { order: number; id: string }>(a: T, b: T): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * How strictly the order rules apply. Each level gives up one more rule:
 * 0 all three hold, 1 the category run may exceed two, 2 a topic may also repeat, 3 anything goes.
 */
type Leniency = 0 | 1 | 2 | 3;
const LENIENCY_LEVELS: readonly Leniency[] = [0, 1, 2, 3];

type SlotKind = 'new' | 'retrieval' | 'serendipity';

/** What the order rules look at in one feed entry. */
export interface FeedStep {
  categoryId: string;
  topicId: string;
  load: CardLoad;
}

export interface OrderViolations {
  /** More than two cards in a row from one category. */
  category: boolean;
  /** The same topic twice in a row. */
  topic: boolean;
  /** More than three heavy cards in a row. */
  heavy: boolean;
}

/** Which of the three order rules a sequence of steps breaks. */
export function orderViolations(steps: readonly FeedStep[]): OrderViolations {
  const violations = { category: false, topic: false, heavy: false };
  let categoryRun = 0;
  let heavyRun = 0;
  steps.forEach((step, index) => {
    const previous = steps[index - 1];
    categoryRun = previous?.categoryId === step.categoryId ? categoryRun + 1 : 1;
    heavyRun = step.load === 'heavy' ? heavyRun + 1 : 0;
    if (categoryRun > MAX_CATEGORY_RUN) violations.category = true;
    if (previous?.topicId === step.topicId) violations.topic = true;
    if (heavyRun > MAX_HEAVY_RUN) violations.heavy = true;
  });
  return violations;
}

// ---------------------------------------------------------------------------------------------
// The working state of one batch
// ---------------------------------------------------------------------------------------------

class Workbench {
  private readonly cardsById = new Map<string, MixerCard>();
  private readonly cardsByTopic = new Map<string, MixerCard[]>();
  private readonly topicsById = new Map<string, MixerTopic>();
  private readonly topicsByCategory = new Map<string, MixerTopic[]>();
  private readonly categoriesById = new Map<string, MixerCategory>();
  private readonly statesById = new Map<string, MixerCardState>();
  private readonly categories: MixerCategory[];

  /** Cards the reader has really seen. */
  private readonly seen = new Set<string>();
  /** Seen cards plus first readings that are queued or picked: they are no longer "next". */
  private readonly spoken = new Set<string>();
  /** Every card that is queued or picked, of any kind. */
  private readonly taken = new Set<string>();
  private readonly trail: FeedStep[] = [];
  private newCount: number;

  private readonly snapshot: MixerSnapshot;
  private readonly now: number;

  constructor(snapshot: MixerSnapshot, now: Date) {
    this.snapshot = snapshot;
    this.now = now.getTime();
    this.newCount = snapshot.newCardsToday;
    this.categories = [...snapshot.categories].sort((a, b) => (a.id < b.id ? -1 : 1));

    for (const category of this.categories) this.categoriesById.set(category.id, category);
    for (const topic of snapshot.topics) {
      this.topicsById.set(topic.id, topic);
      const list = this.topicsByCategory.get(topic.categoryId) ?? [];
      list.push(topic);
      this.topicsByCategory.set(topic.categoryId, list);
    }
    for (const list of this.topicsByCategory.values()) list.sort(byOrderThenId);
    for (const card of snapshot.cards) {
      this.cardsById.set(card.id, card);
      const list = this.cardsByTopic.get(card.topicId) ?? [];
      list.push(card);
      this.cardsByTopic.set(card.topicId, list);
    }
    for (const list of this.cardsByTopic.values()) list.sort(byOrderThenId);
    for (const state of snapshot.states) {
      this.statesById.set(state.cardId, state);
      this.seen.add(state.cardId);
      this.spoken.add(state.cardId);
    }

    for (const entry of snapshot.pending) this.reserve(entry);
    for (const entry of snapshot.previous) {
      const step = this.stepOf(entry);
      if (step) this.trail.push(step);
    }
  }

  get dueCount(): number {
    return this.dueCards().length;
  }

  /** Records a pick, so that later slots of the batch see it. */
  commit(entry: FeedEntry): void {
    this.reserve(entry);
    const step = this.stepOf(entry);
    if (step) this.trail.push(step);
  }

  private reserve(entry: FeedEntry): void {
    this.taken.add(entry.cardId);
    if (isFirstReading(entry.source)) {
      if (!this.seen.has(entry.cardId)) this.newCount += 1;
      this.spoken.add(entry.cardId);
    }
  }

  private stepOf(entry: FeedEntry): FeedStep | undefined {
    const card = this.cardsById.get(entry.cardId);
    if (!card) return undefined;
    return {
      categoryId: card.categoryId,
      topicId: card.topicId,
      load: entryLoad(entry.source, card.type),
    };
  }

  // ---- Order rules ------------------------------------------------------------------------

  private allows(card: MixerCard, source: FeedSource, leniency: Leniency): boolean {
    const last = this.trail[this.trail.length - 1];

    if (leniency < 1) {
      let run = 0;
      for (let index = this.trail.length - 1; index >= 0; index -= 1) {
        if (this.trail[index]?.categoryId !== card.categoryId) break;
        run += 1;
      }
      if (run >= MAX_CATEGORY_RUN) return false;
    }

    if (leniency < 2 && last?.topicId === card.topicId) return false;

    if (leniency < 3 && entryLoad(source, card.type) === 'heavy') {
      let run = 0;
      for (let index = this.trail.length - 1; index >= 0; index -= 1) {
        if (this.trail[index]?.load !== 'heavy') break;
        run += 1;
      }
      if (run >= MAX_HEAVY_RUN) return false;
    }

    return true;
  }

  // ---- Topics -----------------------------------------------------------------------------

  private seenShare(topicId: string): number | null {
    const cards = this.cardsByTopic.get(topicId) ?? [];
    if (cards.length === 0) return null;
    return cards.filter((card) => this.seen.has(card.id)).length / cards.length;
  }

  /**
   * A topic unlocks when at least half of each prerequisite topic has been seen. A prerequisite
   * the reader cannot work on does not block: one that is not in the content (its pack is not
   * installed), has no cards, or belongs to a category the reader did not select.
   */
  private isUnlocked(topic: MixerTopic): boolean {
    return topic.prerequisites.every((prerequisiteId) => {
      const prerequisite = this.topicsById.get(prerequisiteId);
      if (!prerequisite) return true;
      const category = this.categoriesById.get(prerequisite.categoryId);
      if (!category || category.weight <= 0) return true;
      const share = this.seenShare(prerequisiteId);
      return share === null || share >= PREREQUISITE_SEEN_SHARE;
    });
  }

  private isInProgress(topicId: string): boolean {
    const cards = this.cardsByTopic.get(topicId) ?? [];
    const spoken = cards.filter((card) => this.spoken.has(card.id)).length;
    return spoken > 0 && spoken < cards.length;
  }

  /** The next card of a topic that the reader has not read: in order, at a fitting difficulty. */
  private nextUnread(topic: MixerTopic, target: number): MixerCard | undefined {
    const unread = (this.cardsByTopic.get(topic.id) ?? []).filter(
      (card) => !this.spoken.has(card.id),
    );
    const notUnderstood = this.snapshot.easier[topic.id];
    if (notUnderstood !== undefined) {
      const easier = unread.find((card) => card.difficulty < notUnderstood);
      if (easier) return easier;
    }
    return (
      unread.find((card) => Math.abs(card.difficulty - target) <= DIFFICULTY_TOLERANCE) ?? unread[0]
    );
  }

  // ---- Candidates -------------------------------------------------------------------------

  private pickNew(leniency: Leniency, rng: () => number): FeedEntry | undefined {
    if (this.newCount >= this.snapshot.newCardCap) return undefined;

    const options = [];
    for (const category of this.categories) {
      if (category.weight <= 0) continue;
      const unlocked = (this.topicsByCategory.get(category.id) ?? []).filter((topic) =>
        this.isUnlocked(topic),
      );
      if (unlocked.length === 0) continue;

      const topics = [];
      for (const topic of unlocked) {
        const card = this.nextUnread(topic, category.difficultyTarget);
        if (!card || !this.allows(card, 'new', leniency)) continue;
        const boost = this.isInProgress(topic.id) ? IN_PROGRESS_TOPIC_BOOST : 1;
        topics.push({ card, weight: topic.affinity * boost });
      }
      if (topics.length === 0) continue;

      const meanAffinity =
        unlocked.reduce((sum, topic) => sum + topic.affinity, 0) / unlocked.length;
      options.push({ topics, weight: category.weight * meanAffinity });
    }

    const category = pickWeighted(options, (option) => option.weight, rng);
    const topic = category && pickWeighted(category.topics, (option) => option.weight, rng);
    return topic && { cardId: topic.card.id, source: 'new' };
  }

  private dueCards(): { card: MixerCard; due: number }[] {
    const due = [];
    for (const state of this.snapshot.states) {
      if (state.due === null || state.due > this.now || this.taken.has(state.cardId)) continue;
      const card = this.cardsById.get(state.cardId);
      if (card) due.push({ card, due: state.due });
    }
    return due;
  }

  private isRusty(card: MixerCard): boolean {
    const attribute = this.categoriesById.get(card.categoryId)?.attribute;
    const value = attribute === undefined ? null : this.snapshot.sharpness[attribute];
    return value !== null && value < RUSTY_SHARPNESS;
  }

  /**
   * The most overdue card, after two preferences: a category other than the previous card's,
   * and an attribute that is rusting.
   */
  private pickDue(leniency: Leniency): FeedEntry | undefined {
    const previousCategory = this.trail[this.trail.length - 1]?.categoryId;
    const ranked = this.dueCards()
      .filter(({ card }) => this.allows(card, 'due', leniency))
      .map(({ card, due }) => ({
        card,
        due,
        preference:
          (previousCategory !== undefined && card.categoryId !== previousCategory ? 1 : 0) +
          (this.isRusty(card) ? 1 : 0),
      }))
      .sort(
        (a, b) => b.preference - a.preference || a.due - b.due || (a.card.id < b.card.id ? -1 : 1),
      );
    const best = ranked[0];
    return best && { cardId: best.card.id, source: 'due' };
  }

  /** A quiz on a card seen in the last 72 hours that has not been answered today. */
  private pickRecentQuiz(leniency: Leniency, rng: () => number): FeedEntry | undefined {
    const since = this.now - RECENT_QUIZ_WINDOW_HOURS * 60 * 60 * 1000;
    const candidates = [];
    for (const state of this.snapshot.states) {
      if (state.lastSeenAt < since || state.testedToday || this.taken.has(state.cardId)) continue;
      const card = this.cardsById.get(state.cardId);
      if (card?.hasQuiz && this.allows(card, 'recent', leniency)) candidates.push(card);
    }
    candidates.sort((a, b) => (a.id < b.id ? -1 : 1));
    const card = pickWeighted(candidates, () => 1, rng);
    return card && { cardId: card.id, source: 'recent' };
  }

  /** A light, easy card from a category the reader did not select. */
  private pickSerendipity(leniency: Leniency, rng: () => number): FeedEntry | undefined {
    if (!this.snapshot.serendipity || this.newCount >= this.snapshot.newCardCap) return undefined;

    const options = [];
    for (const category of this.categories) {
      if (category.weight > 0) continue;
      const card = (this.topicsByCategory.get(category.id) ?? [])
        .flatMap((topic) => this.cardsByTopic.get(topic.id) ?? [])
        .find(
          (candidate) =>
            !this.spoken.has(candidate.id) &&
            CARD_LOAD[candidate.type] === 'light' &&
            candidate.difficulty <= SERENDIPITY_MAX_DIFFICULTY &&
            this.allows(candidate, 'serendipity', leniency),
        );
      if (card) options.push(card);
    }
    const card = pickWeighted(options, () => 1, rng);
    return card && { cardId: card.id, source: 'serendipity' };
  }

  // ---- Slots ------------------------------------------------------------------------------

  /**
   * Fills one slot. Each kind of slot has its own order of preference, and a stricter reading of
   * the order rules always wins over a preferred kind of card: a review that obeys the rules is
   * better than a new card that breaks them.
   */
  fill(slot: SlotKind, rng: () => number): FeedEntry | undefined {
    const fresh = (leniency: Leniency) => this.pickNew(leniency, rng);
    const due = (leniency: Leniency) => this.pickDue(leniency);
    const recent = (leniency: Leniency) => this.pickRecentQuiz(leniency, rng);
    const surprise = (leniency: Leniency) => this.pickSerendipity(leniency, rng);

    // A surprise card closes every chain: one extra card from an unselected category is a
    // smaller departure from the plan than breaking an order rule.
    const chain =
      slot === 'retrieval'
        ? [due, recent, fresh, surprise]
        : slot === 'serendipity'
          ? [surprise, fresh, due, recent]
          : [fresh, due, recent, surprise];

    for (const leniency of LENIENCY_LEVELS) {
      for (const pick of chain) {
        const entry = pick(leniency);
        if (entry) return entry;
      }
    }
    return undefined;
  }

  /** Every due card, ordered as the feed would serve them. */
  drainDue(limit: number): FeedEntry[] {
    const queue: FeedEntry[] = [];
    while (queue.length < limit) {
      let entry: FeedEntry | undefined;
      for (const leniency of LENIENCY_LEVELS) {
        entry = this.pickDue(leniency);
        if (entry) break;
      }
      if (!entry) break;
      this.commit(entry);
      queue.push(entry);
    }
    return queue;
  }
}

/**
 * Lays out the slots of a batch. Retrievals are spread evenly: the batch is cut into as many
 * stretches as there are retrievals, and each stretch gets one at a random position. The
 * serendipity card takes a random remaining slot.
 */
function planSlots(
  counts: { new: number; retrieval: number; serendipity: number },
  rng: () => number,
): SlotKind[] {
  const size = counts.new + counts.retrieval + counts.serendipity;
  const slots: SlotKind[] = Array.from({ length: size }, () => 'new');

  for (let index = 0; index < counts.retrieval; index += 1) {
    const start = Math.floor((index * size) / counts.retrieval);
    const end = Math.floor(((index + 1) * size) / counts.retrieval);
    slots[start + Math.floor(rng() * (end - start))] = 'retrieval';
  }

  for (let placed = 0; placed < counts.serendipity; placed += 1) {
    const free = slots.flatMap((slot, index) => (slot === 'new' ? [index] : []));
    const index = free[Math.floor(rng() * free.length)];
    if (index !== undefined) slots[index] = 'serendipity';
  }

  return slots;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/** The next batch of the feed. Shorter than ten entries only when the content runs out. */
export function buildBatch(snapshot: MixerSnapshot, now: Date, rng: () => number): FeedEntry[] {
  const workbench = new Workbench(snapshot, now);
  const counts = workbench.dueCount > BACKLOG_THRESHOLD ? BACKLOG_SLOTS : BATCH_SLOTS;

  const batch: FeedEntry[] = [];
  for (const slot of planSlots(counts, rng)) {
    const entry = workbench.fill(slot, rng);
    if (!entry) continue;
    workbench.commit(entry);
    batch.push(entry);
  }
  return batch;
}

/** The queue of a review session: due cards only, most overdue first, topics interleaved. */
export function buildReviewQueue(snapshot: MixerSnapshot, now: Date, limit: number): FeedEntry[] {
  return new Workbench(snapshot, now).drainDue(limit);
}

/** How many reviews are due at `now`, counting only cards that still exist. */
export function countDue(snapshot: MixerSnapshot, now: Date): number {
  return new Workbench(snapshot, now).dueCount;
}
