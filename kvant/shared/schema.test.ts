import { describe, expect, it } from 'vitest';
import {
  CARD_LOAD,
  CARD_TYPES,
  TITLE_MAX_CHARS,
  builtCardSchema,
  builtPackSchema,
  cardSchema,
  countWords,
  manifestSchema,
  packSchema,
  type Card,
} from './schema.ts';

/** `n` words of filler text. */
function filler(n: number): string {
  return Array.from({ length: n }, () => 'slovo').join(' ');
}

/** The messages of every issue reported for `value`, each prefixed with its path. */
function issuesOf(schema: typeof cardSchema | typeof packSchema, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

// The two example cards and the example pack from docs/SPEC.md section 5.2, verbatim.
const dhCard = {
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
};

const spindelCard = {
  id: 'nemcina.vyroba.spindel',
  topicId: 'nemcina.vyroba',
  type: 'vocab',
  difficulty: 2,
  order: 3,
  title: 'die Spindel',
  de: 'die Spindel',
  plural: 'die Spindeln',
  sk: 'vreteno',
  exampleDe: 'Die Spindel dreht sich mit 12 000 Umdrehungen pro Minute.',
  exampleSk: 'Vreteno sa otáča rýchlosťou 12 000 otáčok za minútu.',
  recall: { q: 'Ako sa po nemecky povie „vreteno“ (aj s členom)?', a: 'die Spindel' },
  tags: ['výroba', 'stroje'],
};

const robotikaPack = {
  schemaVersion: 1,
  packId: 'robotika',
  packVersion: 1,
  language: 'sk',
  category: {
    id: 'robotika',
    name: 'Robotika',
    attribute: 'T',
    description: 'Kinematika, trajektórie, koboty a bezpečnosť robotických pracovísk.',
    color: '#4F8EF7',
    icon: 'bot',
    defaultDifficulty: 3,
  },
  topics: [
    {
      id: 'robotika.kinematika',
      name: 'Kinematika robota',
      order: 1,
      prerequisites: ['matematika.matice-transformacie'],
      description: 'Priama a inverzná kinematika, DH parametre, singularity.',
    },
  ],
  cards: [dhCard],
};

const common = {
  topicId: 'robotika.kinematika',
  difficulty: 3,
  order: 1,
  title: 'Nadpis',
  tags: [],
};
const recall = { q: 'Otázka?', a: 'Odpoveď.' };

/** One minimal valid card of every type. */
const validByType: Record<Card['type'], Record<string, unknown>> = {
  concept: {
    ...common,
    id: 'robotika.kinematika.koncept',
    type: 'concept',
    body: filler(40),
    simple: filler(10),
    recall,
  },
  formula: {
    ...common,
    id: 'robotika.kinematika.vzorec',
    type: 'formula',
    latex: 'v = \\omega r',
    legend: [{ symbol: 'v', meaning: 'obvodová rýchlosť', unit: 'm/s' }],
    body: filler(20),
    example: 'Pri ω = 2 rad/s a r = 0,5 m je v = 1 m/s.',
    recall,
  },
  example: {
    ...common,
    id: 'robotika.kinematika.priklad',
    type: 'example',
    body: filler(30),
    recall,
  },
  did_you_know: {
    ...common,
    id: 'robotika.kinematika.vedel-si',
    type: 'did_you_know',
    body: filler(30),
    recall,
  },
  myth: {
    ...common,
    id: 'robotika.kinematika.mytus',
    type: 'myth',
    statement: 'Šesťosový robot dosiahne každý bod v ľubovoľnej orientácii.',
    isTrue: false,
    explanation: filler(12),
  },
  quiz: {
    ...common,
    id: 'robotika.kinematika.kviz',
    type: 'quiz',
    question: 'Koľko stupňov voľnosti má tuhé teleso v priestore?',
    options: ['Tri', 'Šesť', 'Deväť'],
    correctIndex: 1,
    explanation: filler(8),
  },
  numeric: {
    ...common,
    id: 'robotika.kinematika.vypocet',
    type: 'numeric',
    question: 'Aká je obvodová rýchlosť pri ω = 2 rad/s a r = 0,5 m?',
    answer: 1,
    tolerance: 0.02,
    unit: 'm/s',
    solution: filler(10),
  },
  vocab: {
    ...common,
    id: 'robotika.kinematika.slovicko',
    type: 'vocab',
    de: 'das Gelenk',
    sk: 'kĺb',
    exampleDe: 'Das Gelenk dreht sich.',
    exampleSk: 'Kĺb sa otáča.',
    recall,
  },
};

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('jedno')).toBe(1);
    expect(countWords('  dve   slová ')).toBe(2);
    expect(countWords('riadok\njeden\ta dva')).toBe(4);
  });

  it('treats a grouped number as two words and punctuation as part of a word', () => {
    expect(countWords('12 000 otáčok za minútu.')).toBe(5);
    expect(countWords('dĺžka článku a, uhol α')).toBe(5);
  });
});

describe('card types', () => {
  it('classifies the load of every type as the spec does', () => {
    expect(Object.keys(CARD_LOAD).sort()).toEqual([...CARD_TYPES].sort());
    expect(CARD_LOAD).toEqual({
      concept: 'heavy',
      formula: 'heavy',
      numeric: 'heavy',
      example: 'light',
      did_you_know: 'light',
      myth: 'light',
      vocab: 'light',
      quiz: 'interactive',
    });
  });

  it.each(CARD_TYPES)('accepts a minimal %s card', (type) => {
    expect(issuesOf(cardSchema, validByType[type])).toEqual([]);
  });
});

describe('cardSchema', () => {
  it('accepts the concept example from the spec', () => {
    const card = cardSchema.parse(dhCard);
    expect(card.type).toBe('concept');
    // Narrowing by `type` exposes the fields of that card type.
    if (card.type === 'concept') {
      expect(countWords(card.body)).toBe(43);
      expect(card.quiz?.correctIndex).toBe(1);
    }
  });

  it('accepts the vocab example from the spec', () => {
    expect(issuesOf(cardSchema, spindelCard)).toEqual([]);
  });

  it('rejects an unknown key', () => {
    expect(issuesOf(cardSchema, { ...dhCard, explaination: 'preklep' })).toEqual([
      ': Unrecognized key: "explaination"',
    ]);
  });

  it('rejects an id that does not belong to its topic', () => {
    expect(issuesOf(cardSchema, { ...dhCard, id: 'robotika.dynamika.dh-parametre' })).toEqual([
      'id: card id must start with its topicId "robotika.kinematika."',
    ]);
  });

  it.each(['Robotika.kinematika.x', 'robotika.kinematika', 'robotika.kinematika.dh parametre'])(
    'rejects the malformed id %j',
    (id) => {
      expect(issuesOf(cardSchema, { ...dhCard, id })[0]).toMatch(/^id: /);
    },
  );

  it('requires recall on every type that does not test itself', () => {
    for (const type of ['concept', 'formula', 'example', 'did_you_know', 'vocab'] as const) {
      const withoutRecall: Record<string, unknown> = { ...validByType[type] };
      delete withoutRecall.recall;
      expect(issuesOf(cardSchema, withoutRecall)[0]).toMatch(/^recall: /);
    }
  });

  it('rejects recall on the self-testing types', () => {
    for (const type of ['quiz', 'myth', 'numeric'] as const) {
      expect(issuesOf(cardSchema, { ...validByType[type], recall })).toEqual([
        ': Unrecognized key: "recall"',
      ]);
    }
  });

  it('limits the recall answer to 25 words', () => {
    const at = { ...dhCard, recall: { q: 'Otázka?', a: filler(25) } };
    const over = { ...dhCard, recall: { q: 'Otázka?', a: filler(26) } };
    expect(issuesOf(cardSchema, at)).toEqual([]);
    expect(issuesOf(cardSchema, over)).toEqual([
      'recall.a: too long: 26 words, expected at most 25',
    ]);
  });

  it('keeps a concept body between 40 and 90 words', () => {
    const body = (n: number) => issuesOf(cardSchema, { ...validByType.concept, body: filler(n) });
    expect(body(39)).toEqual(['body: too short: 39 words, expected at least 40']);
    expect(body(40)).toEqual([]);
    expect(body(90)).toEqual([]);
    expect(body(91)).toEqual(['body: too long: 91 words, expected at most 90']);
  });

  it('limits the simple version of a concept to 40 words', () => {
    expect(issuesOf(cardSchema, { ...validByType.concept, simple: filler(41) })).toEqual([
      'simple: too long: 41 words, expected at most 40',
    ]);
  });

  it('keeps light bodies between 30 and 80 words', () => {
    for (const type of ['example', 'did_you_know'] as const) {
      const body = (n: number) => issuesOf(cardSchema, { ...validByType[type], body: filler(n) });
      expect(body(29)).toEqual(['body: too short: 29 words, expected at least 30']);
      expect(body(80)).toEqual([]);
      expect(body(81)).toEqual(['body: too long: 81 words, expected at most 80']);
    }
  });

  it('limits a formula body to 60 words and its example to one line', () => {
    expect(issuesOf(cardSchema, { ...validByType.formula, body: filler(61) })).toEqual([
      'body: too long: 61 words, expected at most 60',
    ]);
    expect(issuesOf(cardSchema, { ...validByType.formula, example: 'prvý\ndruhý' })).toEqual([
      'example: must be a single line',
    ]);
    expect(issuesOf(cardSchema, { ...validByType.formula, legend: [] })[0]).toMatch(/^legend: /);
  });

  it('limits explanations to 40 words and solutions to 60', () => {
    expect(issuesOf(cardSchema, { ...validByType.myth, explanation: filler(41) })).toEqual([
      'explanation: too long: 41 words, expected at most 40',
    ]);
    expect(issuesOf(cardSchema, { ...validByType.quiz, explanation: filler(41) })).toEqual([
      'explanation: too long: 41 words, expected at most 40',
    ]);
    expect(issuesOf(cardSchema, { ...validByType.numeric, solution: filler(61) })).toEqual([
      'solution: too long: 61 words, expected at most 60',
    ]);
  });

  it(`limits the title to ${TITLE_MAX_CHARS} characters`, () => {
    expect(issuesOf(cardSchema, { ...dhCard, title: 'ž'.repeat(TITLE_MAX_CHARS) })).toEqual([]);
    expect(issuesOf(cardSchema, { ...dhCard, title: 'ž'.repeat(TITLE_MAX_CHARS + 1) })[0]).toMatch(
      /^title: /,
    );
    expect(issuesOf(cardSchema, { ...dhCard, title: '   ' })[0]).toMatch(/^title: /);
  });

  it.each([0, 6, 2.5, '3'])('rejects difficulty %j', (difficulty) => {
    expect(issuesOf(cardSchema, { ...dhCard, difficulty })[0]).toMatch(/^difficulty: /);
  });

  describe('quiz rules', () => {
    const quiz = validByType.quiz;

    it('needs three or four options', () => {
      expect(issuesOf(cardSchema, { ...quiz, options: ['A', 'B'], correctIndex: 0 })[0]).toMatch(
        /^options: /,
      );
      expect(
        issuesOf(cardSchema, { ...quiz, options: ['A', 'B', 'C', 'D', 'E'], correctIndex: 0 })[0],
      ).toMatch(/^options: /);
      expect(issuesOf(cardSchema, { ...quiz, options: ['A', 'B', 'C', 'D'] })).toEqual([]);
    });

    it('rejects a correctIndex outside the options', () => {
      expect(issuesOf(cardSchema, { ...quiz, correctIndex: 3 })).toEqual([
        'correctIndex: correctIndex 3 is out of range for 3 options',
      ]);
      expect(issuesOf(cardSchema, { ...quiz, correctIndex: -1 })[0]).toMatch(/^correctIndex: /);
    });

    it('rejects duplicate options, ignoring case and surrounding spaces', () => {
      expect(issuesOf(cardSchema, { ...quiz, options: ['Šesť', 'Tri', ' šesť '] })).toEqual([
        'options.2: duplicate option " šesť "',
      ]);
    });

    it('applies the same rules to a quiz embedded in a concept', () => {
      const embedded = { ...dhCard.quiz, options: ['d', 'd', 'a'], correctIndex: 5 };
      expect(issuesOf(cardSchema, { ...dhCard, quiz: embedded })).toEqual([
        'quiz.correctIndex: correctIndex 5 is out of range for 3 options',
        'quiz.options.1: duplicate option "d"',
      ]);
    });
  });

  describe('volatile facts', () => {
    it('accepts volatile with validAsOf, with or without a jurisdiction', () => {
      expect(
        issuesOf(cardSchema, {
          ...dhCard,
          volatile: true,
          validAsOf: '2026-11',
          jurisdiction: 'SK',
        }),
      ).toEqual([]);
      expect(issuesOf(cardSchema, { ...dhCard, volatile: true, validAsOf: '2026-01' })).toEqual([]);
    });

    it('rejects volatile without validAsOf', () => {
      expect(issuesOf(cardSchema, { ...dhCard, volatile: true })).toEqual([
        'validAsOf: a volatile card needs validAsOf (YYYY-MM)',
      ]);
    });

    it('rejects validAsOf or jurisdiction on a card that is not volatile', () => {
      const message =
        'volatile: validAsOf and jurisdiction are only allowed together with volatile: true';
      expect(issuesOf(cardSchema, { ...dhCard, validAsOf: '2026-11' })).toEqual([message]);
      expect(issuesOf(cardSchema, { ...dhCard, jurisdiction: 'EU' })).toEqual([message]);
    });

    it.each(['2026', '2026-13', '2026-1', '11-2026', '2026-11-09'])(
      'rejects the validAsOf value %j',
      (validAsOf) => {
        expect(issuesOf(cardSchema, { ...dhCard, volatile: true, validAsOf })[0]).toMatch(
          /^validAsOf: /,
        );
      },
    );

    it('only knows the jurisdictions SK, CZ and EU', () => {
      expect(
        issuesOf(cardSchema, {
          ...dhCard,
          volatile: true,
          validAsOf: '2026-11',
          jurisdiction: 'DE',
        })[0],
      ).toMatch(/^jurisdiction: /);
    });
  });

  it('rejects a numeric card with a bad answer or tolerance', () => {
    expect(issuesOf(cardSchema, { ...validByType.numeric, answer: Number.NaN })[0]).toMatch(
      /^answer: /,
    );
    expect(issuesOf(cardSchema, { ...validByType.numeric, tolerance: -0.1 })[0]).toMatch(
      /^tolerance: /,
    );
  });
});

describe('packSchema', () => {
  it('accepts the example pack from the spec', () => {
    const pack = packSchema.parse(robotikaPack);
    expect(pack.cards).toHaveLength(1);
    expect(pack.topics[0]?.prerequisites).toEqual(['matematika.matice-transformacie']);
  });

  it('rejects a pack whose category is not the pack itself', () => {
    const pack = { ...robotikaPack, category: { ...robotikaPack.category, id: 'matematika' } };
    expect(issuesOf(packSchema, pack)).toEqual([
      'category.id: category.id must equal packId "robotika"',
    ]);
  });

  it('rejects a topic from another category', () => {
    const topic = { ...robotikaPack.topics[0], id: 'matematika.matice' };
    expect(issuesOf(packSchema, { ...robotikaPack, topics: [topic], cards: [] })).toEqual([
      'topics.0.id: topic id must start with "robotika."',
    ]);
  });

  it('rejects duplicate topic ids and a topic that requires itself', () => {
    const topic = { ...robotikaPack.topics[0], prerequisites: ['robotika.kinematika'] };
    expect(issuesOf(packSchema, { ...robotikaPack, topics: [topic, topic] })).toEqual([
      'topics.0.prerequisites: a topic cannot be its own prerequisite',
      'topics.1.id: duplicate topic id "robotika.kinematika"',
      'topics.1.prerequisites: a topic cannot be its own prerequisite',
    ]);
  });

  it('rejects a card whose topic is not in the pack, and duplicate card ids', () => {
    const stray = {
      ...validByType.myth,
      id: 'robotika.dynamika.mytus',
      topicId: 'robotika.dynamika',
    };
    expect(issuesOf(packSchema, { ...robotikaPack, cards: [dhCard, stray, dhCard] })).toEqual([
      'cards.1.topicId: unknown topicId "robotika.dynamika"',
      'cards.2.id: duplicate card id "robotika.kinematika.dh-parametre"',
    ]);
  });

  it('reports card errors with the path of the card', () => {
    const broken = { ...dhCard, difficulty: 9 };
    expect(issuesOf(packSchema, { ...robotikaPack, cards: [broken] })[0]).toMatch(
      /^cards\.0\.difficulty: /,
    );
  });

  it('pins the schema version and the language', () => {
    expect(issuesOf(packSchema, { ...robotikaPack, schemaVersion: 2 })[0]).toMatch(
      /^schemaVersion: /,
    );
    expect(issuesOf(packSchema, { ...robotikaPack, language: 'en' })[0]).toMatch(/^language: /);
    expect(issuesOf(packSchema, { ...robotikaPack, packVersion: 0 })[0]).toMatch(/^packVersion: /);
  });

  it('validates the category colour, icon and attribute', () => {
    const withCategory = (patch: Record<string, unknown>) => ({
      ...robotikaPack,
      category: { ...robotikaPack.category, ...patch },
    });
    expect(issuesOf(packSchema, withCategory({ color: 'blue' }))[0]).toMatch(/^category\.color: /);
    expect(issuesOf(packSchema, withCategory({ icon: 'Bot' }))[0]).toMatch(/^category\.icon: /);
    expect(issuesOf(packSchema, withCategory({ attribute: 'X' }))[0]).toMatch(
      /^category\.attribute: /,
    );
  });
});

describe('built packs', () => {
  const hash = 'a3f1c29b7e0d4a55';

  it('requires a contentHash on every built card', () => {
    expect(builtCardSchema.safeParse({ ...dhCard, contentHash: hash }).success).toBe(true);
    expect(builtCardSchema.safeParse(dhCard).success).toBe(false);
    expect(builtCardSchema.safeParse({ ...dhCard, contentHash: 'XYZ' }).success).toBe(false);
  });

  it('keeps contentHash out of source cards', () => {
    expect(issuesOf(cardSchema, { ...dhCard, contentHash: hash })).toEqual([
      ': Unrecognized key: "contentHash"',
    ]);
  });

  it('still applies the card rules to built cards', () => {
    const result = builtCardSchema.safeParse({ ...dhCard, contentHash: hash, volatile: true });
    expect(result.success).toBe(false);
  });

  it('accepts a built pack and a manifest that describes it', () => {
    const built = { ...robotikaPack, cards: [{ ...dhCard, contentHash: hash }] };
    expect(builtPackSchema.safeParse(built).success).toBe(true);
    expect(builtPackSchema.safeParse(robotikaPack).success).toBe(false);

    const manifest = [{ packId: 'robotika', packVersion: 1, hash, cardCount: 1 }];
    expect(manifestSchema.parse(manifest)).toEqual(manifest);
    expect(manifestSchema.safeParse([{ ...manifest[0], hash: 'not-hex' }]).success).toBe(false);
    expect(manifestSchema.safeParse([{ ...manifest[0], extra: true }]).success).toBe(false);
  });
});
