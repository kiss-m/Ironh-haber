/** What the type of a card means for how it is shown and tested. */
import type { Card } from '../../shared/schema.ts';

/**
 * How a card is retrieved (docs/SPEC.md section 9): by its own quiz if it has one, otherwise as
 * a flashcard that the reader grades.
 *
 *   quiz       the card is a quiz, or a concept that carries one
 *   myth       a statement to judge as true or false
 *   flashcard  the recall question, then the answer with four grade buttons
 */
export type ReviewForm = 'quiz' | 'myth' | 'flashcard';

export function reviewForm(card: Card): ReviewForm {
  if (card.type === 'quiz') return 'quiz';
  if (card.type === 'concept' && card.quiz !== undefined) return 'quiz';
  if (card.type === 'myth') return 'myth';
  // numeric cards get their own form in Phase 4. Until then they fall back to a flashcard.
  return 'flashcard';
}

/** Whether a review of the card is a question with a right answer, not a self-graded one. */
export function hasQuiz(card: Card): boolean {
  return reviewForm(card) !== 'flashcard';
}

/** Whether the reader answers the card the first time it is shown. */
export function isAnsweredOnSight(card: Card): boolean {
  return card.type === 'quiz' || card.type === 'myth';
}

/** The quiz a review of the card shows, if it has one. */
export function quizOf(
  card: Card,
): { question: string; options: string[]; correctIndex: number; explanation: string } | undefined {
  if (card.type === 'quiz') return card;
  if (card.type === 'concept') return card.quiz;
  return undefined;
}
