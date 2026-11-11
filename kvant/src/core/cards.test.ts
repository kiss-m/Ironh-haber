import { describe, expect, it } from 'vitest';
import type { Card } from '../../shared/schema.ts';
import { hasQuiz, isAnsweredOnSight, quizOf, reviewForm } from './cards.ts';

const base = { topicId: 'a.t', difficulty: 2, order: 1, title: 'Karta', tags: [] };
const recall = { q: 'Otázka?', a: 'Odpoveď.' };
const quiz = { question: 'Koľko?', options: ['1', '2', '3'], correctIndex: 1, explanation: 'Dva.' };

const concept: Card = {
  ...base,
  id: 'a.t.c',
  type: 'concept',
  body: 'Text.',
  simple: 'Text.',
  recall,
};
const conceptWithQuiz: Card = { ...concept, id: 'a.t.cq', quiz };
const formula: Card = {
  ...base,
  id: 'a.t.f',
  type: 'formula',
  latex: 'a=b',
  legend: [{ symbol: 'a', meaning: 'veličina' }],
  body: 'Text.',
  example: 'Príklad.',
  recall,
};
const example: Card = { ...base, id: 'a.t.e', type: 'example', body: 'Text.', recall };
const didYouKnow: Card = { ...base, id: 'a.t.d', type: 'did_you_know', body: 'Text.', recall };
const myth: Card = {
  ...base,
  id: 'a.t.m',
  type: 'myth',
  statement: 'Tvrdenie.',
  isTrue: false,
  explanation: 'Nie.',
};
const quizCard: Card = { ...base, id: 'a.t.q', type: 'quiz', ...quiz };

describe('reviewForm', () => {
  it('reviews a card by its own quiz when it has one', () => {
    expect(reviewForm(quizCard)).toBe('quiz');
    expect(reviewForm(conceptWithQuiz)).toBe('quiz');
    expect(reviewForm(myth)).toBe('myth');
  });

  it('falls back to a flashcard otherwise', () => {
    for (const card of [concept, formula, example, didYouKnow]) {
      expect(reviewForm(card), card.type).toBe('flashcard');
    }
  });
});

describe('hasQuiz', () => {
  it('is true exactly for cards with a right answer', () => {
    expect([quizCard, conceptWithQuiz, myth].map(hasQuiz)).toEqual([true, true, true]);
    expect([concept, formula, example, didYouKnow].map(hasQuiz)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('isAnsweredOnSight', () => {
  it('is true for quizzes and myths, not for a concept that only carries a quiz', () => {
    expect(isAnsweredOnSight(quizCard)).toBe(true);
    expect(isAnsweredOnSight(myth)).toBe(true);
    expect(isAnsweredOnSight(conceptWithQuiz)).toBe(false);
    expect(isAnsweredOnSight(example)).toBe(false);
  });
});

describe('quizOf', () => {
  it('finds the quiz of a quiz card and of a concept', () => {
    expect(quizOf(quizCard)?.correctIndex).toBe(1);
    expect(quizOf(conceptWithQuiz)?.question).toBe('Koľko?');
    expect(quizOf(concept)).toBeUndefined();
    expect(quizOf(myth)).toBeUndefined();
  });
});
