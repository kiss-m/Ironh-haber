/**
 * Adaptive difficulty of a category (docs/SPEC.md section 8).
 *
 * The target starts at the category's default difficulty. It looks at the last 20 graded answers
 * in the category and moves one step up when more than 85 % of them were correct, one step down
 * when fewer than 60 % were. It needs at least 8 answers and moves at most once per 10 answers.
 */
import { ADAPTIVE } from './config.ts';

export interface DifficultyState {
  /** 1–5. New cards within one step of it are preferred. */
  target: number;
  /** Whether each of the most recent graded answers was correct, oldest first. */
  recent: boolean[];
  /** Graded answers since the target last moved. */
  answersSinceAdjust: number;
}

export function initialDifficulty(defaultDifficulty: number): DifficultyState {
  return {
    target: Math.min(ADAPTIVE.max, Math.max(ADAPTIVE.min, defaultDifficulty)),
    recent: [],
    // The first adjustment only has to wait for enough answers, not for the cooldown.
    answersSinceAdjust: ADAPTIVE.cooldown,
  };
}

export function accuracy(recent: readonly boolean[]): number {
  if (recent.length === 0) return 0;
  return recent.filter(Boolean).length / recent.length;
}

/** The state after one more graded answer. */
export function recordGradedAnswer(state: DifficultyState, correct: boolean): DifficultyState {
  const recent = [...state.recent, correct].slice(-ADAPTIVE.window);
  const answersSinceAdjust = state.answersSinceAdjust + 1;

  if (recent.length < ADAPTIVE.minAnswers || answersSinceAdjust < ADAPTIVE.cooldown) {
    return { target: state.target, recent, answersSinceAdjust };
  }

  const share = accuracy(recent);
  const step = share > ADAPTIVE.raiseAbove ? 1 : share < ADAPTIVE.lowerBelow ? -1 : 0;
  const target = Math.min(ADAPTIVE.max, Math.max(ADAPTIVE.min, state.target + step));

  // Only a real move starts the cooldown. Pushing against a limit changes nothing.
  return target === state.target
    ? { target, recent, answersSinceAdjust }
    : { target, recent, answersSinceAdjust: 0 };
}
