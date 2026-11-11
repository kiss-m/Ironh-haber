/**
 * Small content packs for tests that need to know exactly which cards exist.
 *
 * A topic is described by one string, one token per card, in reading order:
 *
 *   "E Q C M C! D1"
 *
 * C concept, C! concept with an embedded quiz, E example, D did_you_know, M myth (false),
 * Q quiz. A digit sets the difficulty (default 3). The card id ends in the letter and the
 * position, for example `robotika.zaklady.q2`, and the title is that id.
 */
import type { BuiltCard, BuiltPack, Card } from '../../shared/schema.ts';
import type { AttributeCode } from '../../shared/taxonomy.ts';

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `slovo${index + 1}`).join(' ');
}

const QUIZ = {
  question: 'Ktorá možnosť je správna?',
  options: ['Správna', 'Nesprávna', 'Tiež nesprávna'],
  correctIndex: 0,
  explanation: 'Správna je prvá možnosť.',
};

function cardOf(topicId: string, token: string, position: number): Card {
  const match = /^([CEDMQ])(!?)([1-5]?)$/.exec(token);
  if (!match) throw new Error(`Unknown card token "${token}"`);
  const [, letter = '', embedded, digit] = match;
  const id = `${topicId}.${letter.toLowerCase()}${position}`;
  const common = {
    id,
    topicId,
    difficulty: digit ? Number(digit) : 3,
    order: position,
    title: id,
    tags: [],
  };
  const recall = { q: `Čo hovorí karta ${id}?`, a: 'To, čo je na nej napísané.' };

  switch (letter) {
    case 'C':
      return {
        ...common,
        type: 'concept',
        body: `Text karty ${id}. ${words(45)}`,
        simple: `Jednoduchšie povedané: ${id}.`,
        ...(embedded ? { quiz: QUIZ } : {}),
        recall,
      };
    case 'E':
      return { ...common, type: 'example', body: `Príklad ${id}. ${words(32)}`, recall };
    case 'D':
      return { ...common, type: 'did_you_know', body: `Zaujímavosť ${id}. ${words(32)}`, recall };
    case 'M':
      return {
        ...common,
        type: 'myth',
        statement: `Tvrdenie karty ${id}.`,
        isTrue: false,
        explanation: 'V skutočnosti je to inak.',
      };
    default:
      return { ...common, type: 'quiz', ...QUIZ };
  }
}

export interface PackSpec {
  /** Also the category id. */
  packId: string;
  attribute?: AttributeCode;
  /** Topic slug → card tokens. */
  topics: Record<string, string>;
}

export function packOf(spec: PackSpec): BuiltPack {
  const topicSlugs = Object.keys(spec.topics);
  let serial = 0;
  return {
    schemaVersion: 1,
    packId: spec.packId,
    packVersion: 1,
    language: 'sk',
    category: {
      id: spec.packId,
      name: `Kategória ${spec.packId}`,
      attribute: spec.attribute ?? 'T',
      description: 'Opis kategórie.',
      color: '#4F8EF7',
      icon: 'bot',
      defaultDifficulty: 3,
    },
    topics: topicSlugs.map((slug, index) => ({
      id: `${spec.packId}.${slug}`,
      name: `Téma ${slug}`,
      order: index + 1,
      prerequisites: [],
      description: 'Opis témy.',
    })),
    cards: topicSlugs.flatMap((slug) =>
      (spec.topics[slug] ?? '')
        .split(/\s+/u)
        .filter(Boolean)
        .map((token, index): BuiltCard => {
          serial += 1;
          return {
            ...cardOf(`${spec.packId}.${slug}`, token, index + 1),
            contentHash: serial.toString(16).padStart(16, '0'),
          };
        }),
    ),
  };
}

/**
 * Three categories with one topic of twelve cards each. Every topic opens with a mix of
 * readings and questions, so the first batch of the feed holds every kind of card, and each has
 * one easy card near its end.
 */
export function smallPacks(): BuiltPack[] {
  return [
    packOf({
      packId: 'ako-veci-funguju',
      attribute: 'W',
      topics: { kuchyna: 'E Q C M D Q C E Q C D1 Q' },
    }),
    packOf({
      packId: 'fyzika-mechanika',
      topics: { pohyb: 'C Q D M C Q E C Q D C E1' },
    }),
    packOf({
      packId: 'robotika',
      topics: { zaklady: 'D C Q C! M Q E C Q D C E1' },
    }),
  ];
}

/** The type letter of a card from these packs, read from its id. */
export function kindOf(cardId: string): string {
  return cardId.slice(cardId.lastIndexOf('.') + 1, cardId.lastIndexOf('.') + 2);
}
