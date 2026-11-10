/**
 * The packs in content/packs/ are part of the product, so they are tested like code: they must
 * validate, and they must have the shape the feed counts on.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_LOAD, type Pack } from '../shared/schema.ts';
import { validatePack } from './content-lib.ts';

const directory = new URL('../content/packs/', import.meta.url);

const packs: Pack[] = readdirSync(directory)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => {
    const result = validatePack(JSON.parse(readFileSync(new URL(name, directory), 'utf8')), name);
    if (!result.ok) throw new Error(`${name}:\n${result.errors.join('\n')}`);
    return result.pack;
  });

const allCards = packs.flatMap((pack) => pack.cards);

function quizzesOf(pack: Pack) {
  return pack.cards.flatMap((card) =>
    card.type === 'quiz' ? [card] : card.type === 'concept' && card.quiz ? [card.quiz] : [],
  );
}

describe('seed content', () => {
  it('has the three Phase 1 packs with two topics of ten cards each', () => {
    expect(packs.map((pack) => pack.packId)).toEqual([
      'ako-veci-funguju',
      'fyzika-mechanika',
      'robotika',
    ]);
    expect(allCards).toHaveLength(60);
    for (const pack of packs) {
      expect(pack.topics, pack.packId).toHaveLength(2);
      for (const topic of pack.topics) {
        const cards = pack.cards.filter((card) => card.topicId === topic.id);
        expect(cards, topic.id).toHaveLength(10);
        expect(cards.map((card) => card.order).sort((a, b) => a - b)).toEqual([
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        ]);
      }
    }
  });

  it('covers every Phase 1 card type', () => {
    const types = new Set(allCards.map((card) => card.type));
    expect([...types].sort()).toEqual([
      'concept',
      'did_you_know',
      'example',
      'formula',
      'myth',
      'quiz',
    ]);
  });

  it('keeps the format mix near half heavy, a quarter light, a quarter quiz', () => {
    const share = (load: string) =>
      allCards.filter((card) => CARD_LOAD[card.type] === load).length / allCards.length;
    expect(share('heavy')).toBeGreaterThan(0.4);
    expect(share('heavy')).toBeLessThan(0.6);
    expect(share('light')).toBeGreaterThan(0.2);
    expect(share('interactive')).toBeGreaterThanOrEqual(0.2);
  });

  it('never lines up more than two heavy cards in a topic', () => {
    // The mixer reads a topic in order. Alternating formats here is what lets it keep the
    // "at most three heavy cards in a row" rule on the first day, before any review exists.
    for (const pack of packs) {
      for (const topic of pack.topics) {
        const loads = pack.cards
          .filter((card) => card.topicId === topic.id)
          .sort((a, b) => a.order - b.order)
          .map((card) => CARD_LOAD[card.type]);
        let run = 0;
        for (const load of loads) {
          run = load === 'heavy' ? run + 1 : 0;
          expect(run, topic.id).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('starts at least one topic of every pack without prerequisites', () => {
    for (const pack of packs) {
      expect(
        pack.topics.some((topic) => topic.prerequisites.length === 0),
        pack.packId,
      ).toBe(true);
    }
  });

  it('only names prerequisites that exist', () => {
    const topicIds = new Set(packs.flatMap((pack) => pack.topics.map((topic) => topic.id)));
    for (const pack of packs) {
      for (const topic of pack.topics) {
        for (const prerequisite of topic.prerequisites) {
          expect(topicIds.has(prerequisite), `${topic.id} → ${prerequisite}`).toBe(true);
        }
      }
    }
  });

  it('spreads the position of the correct answer', () => {
    for (const pack of packs) {
      const quizzes = quizzesOf(pack);
      expect(quizzes.length, pack.packId).toBeGreaterThanOrEqual(6);
      const counts = new Map<number, number>();
      for (const quiz of quizzes) {
        counts.set(quiz.correctIndex, (counts.get(quiz.correctIndex) ?? 0) + 1);
      }
      for (const [index, count] of counts) {
        expect(count / quizzes.length, `${pack.packId} index ${index}`).toBeLessThanOrEqual(0.4);
      }
    }
  });

  it('gives a good share of concepts their own quiz', () => {
    const concepts = allCards.filter((card) => card.type === 'concept');
    const withQuiz = concepts.filter((card) => card.quiz !== undefined);
    expect(withQuiz.length / concepts.length).toBeGreaterThanOrEqual(0.4);
  });

  it('keeps bodies short enough to read without scrolling', () => {
    for (const card of allCards) {
      if (!('body' in card)) continue;
      const words = card.body.trim().split(/\s+/).length;
      expect(words, card.id).toBeLessThanOrEqual(75);
    }
  });

  it('uses unique titles', () => {
    const titles = allCards.map((card) => card.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('contains the example card of the spec unchanged', () => {
    const card = allCards.find((candidate) => candidate.id === 'robotika.kinematika.dh-parametre');
    expect(card).toEqual({
      id: 'robotika.kinematika.dh-parametre',
      topicId: 'robotika.kinematika',
      type: 'concept',
      difficulty: 3,
      order: 4,
      title: 'Denavitove–Hartenbergove parametre',
      body: 'Polohu každého článku robota voči predchádzajúcemu opíšeš štyrmi číslami: dĺžka článku a, uhol skrútenia α, posunutie d a uhol kĺbu θ. Pri rotačnom kĺbe sa mení θ, pri posuvnom d. Vynásobením transformačných matíc všetkých kĺbov dostaneš polohu a natočenie nástroja, teda priamu kinematiku.',
      simple:
        'Dohodnutý spôsob, ako štyrmi číslami opísať, ako je každý článok robota pripojený k predošlému.',
      terms: { en: 'Denavit–Hartenberg parameters', de: 'Denavit-Hartenberg-Parameter' },
      recall: { q: 'Ktorý DH parameter sa mení pri rotačnom kĺbe?', a: 'Uhol kĺbu θ.' },
      quiz: {
        question: 'Ktorý DH parameter je premennou posuvného kĺbu?',
        options: ['θ (uhol kĺbu)', 'd (posunutie)', 'a (dĺžka článku)', 'α (uhol skrútenia)'],
        correctIndex: 1,
        explanation: 'Posuvný kĺb mení vzdialenosť pozdĺž osi z, teda posunutie d.',
      },
      tags: ['kinematika', 'transformácie'],
    });
  });
});
