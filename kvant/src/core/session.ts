/**
 * The feed session: how the queue of entries becomes pages, when the next batch is needed, and
 * how a card comes back after "Nerozumiem" (docs/SPEC.md sections 8 and 11).
 */
import { BATCH_SIZE, NEXT_BATCH_LOOKAHEAD, REQUEUE_MIN_GAP } from './config.ts';
import { orderViolations, type FeedEntry, type FeedStep } from './mixer.ts';

export type FeedPage =
  | { kind: 'card'; entry: FeedEntry; entryIndex: number }
  /** Shown after every ten cards. `batch` counts from 1. */
  | { kind: 'checkpoint'; batch: number }
  /** Shown when there is nothing more to learn right now. */
  | { kind: 'end' };

/**
 * Lays the queue out as pages, with a checkpoint after every ten cards. `exhausted` means the
 * mixer has nothing more to add, which closes the feed with an end page.
 */
export function toPages(entries: readonly FeedEntry[], exhausted: boolean): FeedPage[] {
  const pages: FeedPage[] = [];
  entries.forEach((entry, entryIndex) => {
    pages.push({ kind: 'card', entry, entryIndex });
    if ((entryIndex + 1) % BATCH_SIZE === 0) {
      pages.push({ kind: 'checkpoint', batch: (entryIndex + 1) / BATCH_SIZE });
    }
  });
  if (exhausted) pages.push({ kind: 'end' });
  return pages;
}

/** The next batch is built while a few cards are still ahead, so the feed never waits for it. */
export function needsNextBatch(entryCount: number, currentEntryIndex: number): boolean {
  return entryCount - 1 - currentEntryIndex <= NEXT_BATCH_LOOKAHEAD;
}

/** A card waiting to be shown again after "Nerozumiem". */
export interface PendingRepeat {
  cardId: string;
  /** The earliest position in the queue the repeat may take. */
  notBefore: number;
}

/** A repeat of the card at `currentIndex`: at least five other cards come first. */
export function scheduleRepeat(currentIndex: number, cardId: string): PendingRepeat {
  return { cardId, notBefore: currentIndex + 1 + REQUEUE_MIN_GAP };
}

/** How far around an insertion point the order rules can be affected. */
const NEIGHBOURHOOD = 3;

/**
 * Inserts waiting repeats into the queue at the first position that is late enough and breaks
 * none of the order rules. A repeat that does not fit yet keeps waiting for the next batch.
 * With `force`, which is for a feed that is ending, a repeat goes to the first position that is
 * late enough or, failing that, to the end.
 *
 * `describe` returns what the order rules need to know about an entry, or undefined for a card
 * that no longer exists.
 */
export function placeRepeats(
  entries: readonly FeedEntry[],
  repeats: readonly PendingRepeat[],
  describe: (entry: FeedEntry) => FeedStep | undefined,
  force = false,
): { entries: FeedEntry[]; waiting: PendingRepeat[] } {
  const queue = [...entries];
  const waiting: PendingRepeat[] = [];

  const breaksRules = (index: number, entry: FeedEntry): boolean => {
    const window = [
      ...queue.slice(Math.max(0, index - NEIGHBOURHOOD), index),
      entry,
      ...queue.slice(index, index + NEIGHBOURHOOD),
    ];
    const steps = window.map(describe).filter((step) => step !== undefined);
    const { category, topic, heavy } = orderViolations(steps);
    return category || topic || heavy;
  };

  for (const repeat of repeats) {
    const entry: FeedEntry = { cardId: repeat.cardId, source: 'repeat' };
    if (!describe(entry)) continue; // The card was archived meanwhile.

    let position: number | undefined;
    for (let index = repeat.notBefore; index <= queue.length; index += 1) {
      if (!breaksRules(index, entry)) {
        position = index;
        break;
      }
    }
    if (position === undefined) {
      if (!force) {
        waiting.push(repeat);
        continue;
      }
      position = Math.min(repeat.notBefore, queue.length);
    }
    queue.splice(position, 0, entry);
  }

  return { entries: queue, waiting };
}
