/**
 * Topic affinity (docs/SPEC.md section 8): how much the reader seems to like a topic. It starts
 * at 1.0, moves with what the reader does to the topic's cards, and weights the mixer's choice
 * of category and topic.
 */
import { AFFINITY } from './config.ts';

export type AffinitySignal = 'like' | 'unlike' | 'bookmark' | 'unbookmark' | 'known' | 'quickSkip';

const DELTA: Readonly<Record<AffinitySignal, number>> = {
  like: AFFINITY.like,
  // Taking a like or a bookmark back undoes its effect, so toggling cannot inflate a topic.
  unlike: -AFFINITY.like,
  bookmark: AFFINITY.bookmark,
  unbookmark: -AFFINITY.bookmark,
  known: AFFINITY.known,
  quickSkip: AFFINITY.quickSkip,
};

export function applyAffinity(affinity: number, signal: AffinitySignal): number {
  const next = affinity + DELTA[signal];
  // Round away floating-point dust so that stored values stay readable: 1.15, not 1.15000001.
  const rounded = Math.round(next * 1000) / 1000;
  return Math.min(AFFINITY.max, Math.max(AFFINITY.min, rounded));
}
