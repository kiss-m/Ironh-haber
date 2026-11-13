import { describe, expect, it } from 'vitest';
import {
  accuracy,
  initialDifficulty,
  recordGradedAnswer,
  type DifficultyState,
} from './difficulty.ts';

/** Feeds answers in order: 'c' is correct, 'x' is wrong. */
function feed(state: DifficultyState, answers: string): DifficultyState {
  return answers
    .split('')
    .reduce((next, answer) => recordGradedAnswer(next, answer === 'c'), state);
}

describe('adaptive difficulty', () => {
  it('starts at the default difficulty of the category', () => {
    expect(initialDifficulty(3).target).toBe(3);
    expect(initialDifficulty(0).target).toBe(1);
    expect(initialDifficulty(9).target).toBe(5);
  });

  it('does not move before 8 answers', () => {
    expect(feed(initialDifficulty(3), 'ccccccc').target).toBe(3);
    expect(feed(initialDifficulty(3), 'xxxxxxx').target).toBe(3);
  });

  it('raises the target when accuracy is above 85 %', () => {
    const state = feed(initialDifficulty(3), 'cccccccc');
    expect(state.target).toBe(4);
    expect(state.answersSinceAdjust).toBe(0);
  });

  it('lowers the target when accuracy is below 60 %', () => {
    expect(feed(initialDifficulty(3), 'cxxcxxxc').target).toBe(2); // 3 of 8 = 37.5 %
  });

  it('leaves the target alone between 60 % and 85 %', () => {
    expect(feed(initialDifficulty(3), 'ccccccxx').target).toBe(3); // 75 %
    expect(feed(initialDifficulty(3), 'cccccxxx').target).toBe(3); // 62.5 %
    // 85 % itself is not "above 85 %". Three misses first keep every earlier step below it.
    const seventeenOfTwenty = feed(initialDifficulty(3), 'xxx' + 'c'.repeat(17));
    expect(accuracy(seventeenOfTwenty.recent)).toBe(0.85);
    expect(seventeenOfTwenty.target).toBe(3);
    // One more correct answer pushes the oldest miss out: 18 of 20 = 90 %.
    expect(recordGradedAnswer(seventeenOfTwenty, true).target).toBe(4);
  });

  it('moves at most once per 10 answers', () => {
    const raised = feed(initialDifficulty(2), 'cccccccc'); // → 3 after 8 answers
    expect(raised.target).toBe(3);
    const nineMore = feed(raised, 'ccccccccc');
    expect(nineMore.target).toBe(3);
    expect(recordGradedAnswer(nineMore, true).target).toBe(4);
  });

  it('judges only the last 20 answers', () => {
    // Twenty misses long ago, then twenty correct answers: the misses have left the window.
    const state = feed(initialDifficulty(3), 'x'.repeat(20) + 'c'.repeat(20));
    expect(state.recent).toHaveLength(20);
    expect(accuracy(state.recent)).toBe(1);
  });

  it('stays within 1 and 5 and does not burn the cooldown against a limit', () => {
    const top = feed(initialDifficulty(5), 'cccccccc');
    expect(top.target).toBe(5);
    expect(top.answersSinceAdjust).toBeGreaterThanOrEqual(10);

    const bottom = feed(initialDifficulty(1), 'xxxxxxxx');
    expect(bottom.target).toBe(1);
  });

  it('can come back down after a raise proves too much', () => {
    const raised = feed(initialDifficulty(3), 'cccccccc'); // → 4, window holds 8 correct
    // Twelve misses: the window is now 8 correct + 12 wrong = 40 %.
    const after = feed(raised, 'xxxxxxxxxxxx');
    expect(after.target).toBe(3);
  });

  it('reports accuracy of an empty window as 0', () => {
    expect(accuracy([])).toBe(0);
    expect(accuracy([true, false, true, true])).toBe(0.75);
  });
});
