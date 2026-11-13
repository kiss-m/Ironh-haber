import { describe, expect, it } from 'vitest';
import { XP } from './config.ts';
import { answerXp, nextCorrectStreak } from './xp.ts';

describe('answerXp', () => {
  it('gives 10 XP for a correct answer and 2 for a wrong one', () => {
    expect(answerXp(true, 1)).toBe(10);
    expect(answerXp(true, 2)).toBe(10);
    expect(answerXp(false, 0)).toBe(2);
  });

  it('multiplies by 1.5 from the third correct answer in a row', () => {
    expect(answerXp(true, 3)).toBe(15);
    expect(answerXp(true, 4)).toBe(15);
    expect(answerXp(true, 40)).toBe(15);
  });

  it('never multiplies a wrong answer', () => {
    expect(answerXp(false, 5)).toBe(XP.wrongAnswer);
  });
});

describe('nextCorrectStreak', () => {
  it('grows with correct answers and resets on a miss', () => {
    expect(nextCorrectStreak(0, true)).toBe(1);
    expect(nextCorrectStreak(2, true)).toBe(3);
    expect(nextCorrectStreak(7, false)).toBe(0);
    expect(nextCorrectStreak(0, false)).toBe(0);
  });

  it('pays 10, 10, 15, 15, 2, 10 for five correct answers around a miss', () => {
    const answers = [true, true, true, true, false, true];
    let streak = 0;
    const earned = answers.map((correct) => {
      streak = nextCorrectStreak(streak, correct);
      return answerXp(correct, streak);
    });
    expect(earned).toEqual([10, 10, 15, 15, 2, 10]);
  });
});
