/** Experience points (docs/SPEC.md section 10). Amounts live in config.ts. */
import { XP } from './config.ts';

/**
 * XP for one graded answer.
 *
 * `correctStreak` is the number of correct answers in a row including this one, so it is 0 for a
 * wrong answer. From the third correct answer in a row the amount is multiplied until a miss.
 */
export function answerXp(correct: boolean, correctStreak: number): number {
  if (!correct) return XP.wrongAnswer;
  const multiplier = correctStreak >= XP.streakFrom ? XP.streakMultiplier : 1;
  return Math.round(XP.correctAnswer * multiplier);
}

/** The streak after an answer: one longer after a correct answer, back to zero after a miss. */
export function nextCorrectStreak(previousStreak: number, correct: boolean): number {
  return correct ? previousStreak + 1 : 0;
}
