/**
 * Content schemas (docs/SPEC.md section 5), shared by the app importer and the content scripts.
 *
 * Source packs live in content/packs/<categoryId>.json. `content:build` adds a `contentHash` to
 * every card and writes the built packs plus a manifest to public/content/.
 *
 * Objects are strict: an unknown key is an error, so a typo in generated content cannot pass
 * silently. Checks that need more than one pack (prerequisites that resolve and do not form a
 * cycle, ids unique across packs) and LaTeX parsing belong to `content:check`.
 */
import { z } from 'zod';
import {
  CARD_ID_PATTERN,
  CATEGORY_ID_PATTERN,
  TOPIC_ID_PATTERN,
  categoryIdOf,
  topicIdOf,
} from './ids.ts';
import { ATTRIBUTE_CODES } from './taxonomy.ts';

export const SCHEMA_VERSION = 1;

export const TITLE_MAX_CHARS = 60;

/** Word limits per field, counted with `countWords`. */
export const WORD_LIMITS = {
  conceptBody: { min: 40, max: 90 },
  simple: { max: 40 },
  formulaBody: { max: 60 },
  lightBody: { min: 30, max: 80 },
  explanation: { max: 40 },
  solution: { max: 60 },
  recallAnswer: { max: 25 },
} as const;

interface WordLimit {
  min?: number;
  max: number;
}

/** A word is a run of non-whitespace characters, so "12 000" is two words and "a," is one. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

const text = z.string().regex(/\S/u, 'must not be blank');

function words(limit: WordLimit) {
  return text.superRefine((value, ctx) => {
    const count = countWords(value);
    if (limit.min !== undefined && count < limit.min) {
      ctx.addIssue({
        code: 'custom',
        message: `too short: ${count} words, expected at least ${limit.min}`,
      });
    }
    if (count > limit.max) {
      ctx.addIssue({
        code: 'custom',
        message: `too long: ${count} words, expected at most ${limit.max}`,
      });
    }
  });
}

const categoryId = z.string().regex(CATEGORY_ID_PATTERN, 'must be a lowercase slug');
const topicId = z.string().regex(TOPIC_ID_PATTERN, 'must look like <categoryId>.<topicSlug>');
const cardId = z
  .string()
  .regex(CARD_ID_PATTERN, 'must look like <categoryId>.<topicSlug>.<cardSlug>');
const difficulty = z.int().min(1).max(5);
const contentHash = z.string().regex(/^[0-9a-f]{8,64}$/u, 'must be a lowercase hex digest');

// ---------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------

export const CARD_TYPES = [
  'concept',
  'formula',
  'example',
  'did_you_know',
  'myth',
  'quiz',
  'numeric',
  'vocab',
] as const;

export type CardType = (typeof CARD_TYPES)[number];

/** How demanding a card is to read. The feed never shows more than three heavy cards in a row. */
export type CardLoad = 'heavy' | 'light' | 'interactive';

export const CARD_LOAD: Readonly<Record<CardType, CardLoad>> = {
  concept: 'heavy',
  formula: 'heavy',
  example: 'light',
  did_you_know: 'light',
  myth: 'light',
  quiz: 'interactive',
  numeric: 'heavy',
  vocab: 'light',
};

export const JURISDICTIONS = ['SK', 'CZ', 'EU'] as const;

const commonShape = {
  id: cardId,
  topicId,
  difficulty,
  /** Position within the topic. Cards are read in this order, ties broken by id. */
  order: z.int().min(0),
  title: text.max(TITLE_MAX_CHARS),
  tags: z.array(text),
  /** Only a well-known textbook or standard. Never an invented source. */
  reference: text.optional(),
  /** Marks a fact that changes over time (laws, tax rates, prices, rankings). */
  volatile: z.literal(true).optional(),
  validAsOf: z
    .string()
    .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u, 'must be YYYY-MM')
    .optional(),
  jurisdiction: z.enum(JURISDICTIONS).optional(),
};

/** The question behind a flashcard review. Self-testing types (quiz, myth, numeric) have none. */
const recallSchema = z.strictObject({
  q: text,
  a: words(WORD_LIMITS.recallAnswer),
});

/** English and German equivalents of a technical term. German nouns carry their article. */
const termsSchema = z.strictObject({
  en: text.optional(),
  de: text.optional(),
});

const quizShape = {
  question: text,
  options: z.array(text).min(3).max(4),
  correctIndex: z.int().min(0),
  explanation: words(WORD_LIMITS.explanation),
};

const embeddedQuizSchema = z.strictObject(quizShape);

const legendEntrySchema = z.strictObject({
  symbol: text,
  meaning: text,
  unit: text.optional(),
});

const conceptShape = {
  ...commonShape,
  type: z.literal('concept'),
  body: words(WORD_LIMITS.conceptBody),
  /** A layman version, shown when the reader taps "Nerozumiem". */
  simple: words(WORD_LIMITS.simple),
  terms: termsSchema.optional(),
  quiz: embeddedQuizSchema.optional(),
  recall: recallSchema,
};

const formulaShape = {
  ...commonShape,
  type: z.literal('formula'),
  latex: text,
  legend: z.array(legendEntrySchema).min(1),
  body: words(WORD_LIMITS.formulaBody),
  example: text.regex(/^[^\r\n]*$/u, 'must be a single line'),
  terms: termsSchema.optional(),
  recall: recallSchema,
};

const exampleShape = {
  ...commonShape,
  type: z.literal('example'),
  body: words(WORD_LIMITS.lightBody),
  terms: termsSchema.optional(),
  recall: recallSchema,
};

const didYouKnowShape = {
  ...commonShape,
  type: z.literal('did_you_know'),
  body: words(WORD_LIMITS.lightBody),
  recall: recallSchema,
};

const mythShape = {
  ...commonShape,
  type: z.literal('myth'),
  statement: text,
  isTrue: z.boolean(),
  explanation: words(WORD_LIMITS.explanation),
};

const quizCardShape = {
  ...commonShape,
  type: z.literal('quiz'),
  ...quizShape,
};

const numericShape = {
  ...commonShape,
  type: z.literal('numeric'),
  question: text,
  answer: z.number(),
  /** Relative tolerance: 0.02 accepts answers within 2 % of `answer`. */
  tolerance: z.number().min(0).max(1),
  unit: text.optional(),
  solution: words(WORD_LIMITS.solution),
};

const vocabShape = {
  ...commonShape,
  type: z.literal('vocab'),
  /** German word. Nouns carry their article: "die Spindel". */
  de: text,
  plural: text.optional(),
  sk: text,
  exampleDe: text,
  exampleSk: text,
  recall: recallSchema,
};

/** Builds the card union. Built packs pass `{ contentHash }` to add it to every variant. */
function cardUnion<Extra extends z.ZodRawShape>(extra: Extra) {
  return z.discriminatedUnion('type', [
    z.strictObject({ ...conceptShape, ...extra }),
    z.strictObject({ ...formulaShape, ...extra }),
    z.strictObject({ ...exampleShape, ...extra }),
    z.strictObject({ ...didYouKnowShape, ...extra }),
    z.strictObject({ ...mythShape, ...extra }),
    z.strictObject({ ...quizCardShape, ...extra }),
    z.strictObject({ ...numericShape, ...extra }),
    z.strictObject({ ...vocabShape, ...extra }),
  ]);
}

const sourceCards = cardUnion({});
const builtCards = cardUnion({ contentHash });

export type Card = z.infer<typeof sourceCards>;
export type BuiltCard = z.infer<typeof builtCards>;

interface Issues {
  addIssue(issue: { code: 'custom'; message: string; path: PropertyKey[] }): void;
}

function checkQuiz(
  quiz: { options: readonly string[]; correctIndex: number },
  ctx: Issues,
  path: PropertyKey[],
): void {
  if (quiz.correctIndex >= quiz.options.length) {
    ctx.addIssue({
      code: 'custom',
      message: `correctIndex ${quiz.correctIndex} is out of range for ${quiz.options.length} options`,
      path: [...path, 'correctIndex'],
    });
  }
  const seen = new Set<string>();
  quiz.options.forEach((option, index) => {
    const key = option.trim().toLocaleLowerCase('sk');
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate option "${option}"`,
        path: [...path, 'options', index],
      });
    }
    seen.add(key);
  });
}

/** Rules that span several fields of one card. */
function checkCard(card: Card, ctx: Issues): void {
  if (topicIdOf(card.id) !== card.topicId) {
    ctx.addIssue({
      code: 'custom',
      message: `card id must start with its topicId "${card.topicId}."`,
      path: ['id'],
    });
  }

  if (card.volatile && card.validAsOf === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'a volatile card needs validAsOf (YYYY-MM)',
      path: ['validAsOf'],
    });
  }
  if (!card.volatile && (card.validAsOf !== undefined || card.jurisdiction !== undefined)) {
    ctx.addIssue({
      code: 'custom',
      message: 'validAsOf and jurisdiction are only allowed together with volatile: true',
      path: ['volatile'],
    });
  }

  if (card.type === 'quiz') {
    checkQuiz(card, ctx, []);
  } else if (card.type === 'concept' && card.quiz !== undefined) {
    checkQuiz(card.quiz, ctx, ['quiz']);
  }
}

export const cardSchema = sourceCards.superRefine(checkCard);

export const builtCardSchema = builtCards.superRefine(checkCard);

export type CardOf<T extends CardType> = Extract<Card, { type: T }>;
export type Recall = z.infer<typeof recallSchema>;
export type Terms = z.infer<typeof termsSchema>;
export type EmbeddedQuiz = z.infer<typeof embeddedQuizSchema>;
export type LegendEntry = z.infer<typeof legendEntrySchema>;

// ---------------------------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------------------------

export const categorySchema = z.strictObject({
  id: categoryId,
  name: text,
  attribute: z.enum(ATTRIBUTE_CODES),
  description: text,
  /** Accent colour of the category, as #RRGGBB. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/u, 'must be #RRGGBB'),
  /** A lucide icon name in kebab-case, for example "bot". */
  icon: z.string().regex(CATEGORY_ID_PATTERN, 'must be a kebab-case icon name'),
  defaultDifficulty: difficulty,
});

export const topicSchema = z.strictObject({
  id: topicId,
  name: text,
  order: z.int().min(0),
  /** Topic ids, possibly from other packs. A topic unlocks once half of each is seen. */
  prerequisites: z.array(topicId),
  description: text,
});

export type Category = z.infer<typeof categorySchema>;
export type Topic = z.infer<typeof topicSchema>;

interface PackLike {
  packId: string;
  category: Category;
  topics: readonly Topic[];
  cards: readonly { id: string; topicId: string }[];
}

/** Rules that span the whole pack. */
function checkPack(pack: PackLike, ctx: Issues): void {
  if (pack.category.id !== pack.packId) {
    ctx.addIssue({
      code: 'custom',
      message: `category.id must equal packId "${pack.packId}"`,
      path: ['category', 'id'],
    });
  }

  const topicIds = new Set<string>();
  pack.topics.forEach((topic, index) => {
    if (categoryIdOf(topic.id) !== pack.packId) {
      ctx.addIssue({
        code: 'custom',
        message: `topic id must start with "${pack.packId}."`,
        path: ['topics', index, 'id'],
      });
    }
    if (topicIds.has(topic.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate topic id "${topic.id}"`,
        path: ['topics', index, 'id'],
      });
    }
    topicIds.add(topic.id);
    if (topic.prerequisites.includes(topic.id)) {
      ctx.addIssue({
        code: 'custom',
        message: 'a topic cannot be its own prerequisite',
        path: ['topics', index, 'prerequisites'],
      });
    }
  });

  const cardIds = new Set<string>();
  pack.cards.forEach((card, index) => {
    if (!topicIds.has(card.topicId)) {
      ctx.addIssue({
        code: 'custom',
        message: `unknown topicId "${card.topicId}"`,
        path: ['cards', index, 'topicId'],
      });
    }
    if (cardIds.has(card.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate card id "${card.id}"`,
        path: ['cards', index, 'id'],
      });
    }
    cardIds.add(card.id);
  });
}

function packOf<CardSchema extends z.ZodType<{ id: string; topicId: string }>>(card: CardSchema) {
  return z
    .strictObject({
      schemaVersion: z.literal(SCHEMA_VERSION),
      /** Equal to the category id: one pack per category. */
      packId: categoryId,
      /** Bumped every time the pack's content changes. */
      packVersion: z.int().min(1),
      language: z.literal('sk'),
      category: categorySchema,
      topics: z.array(topicSchema).min(1),
      cards: z.array(card),
    })
    .superRefine(checkPack);
}

/** A source pack: content/packs/<categoryId>.json. */
export const packSchema = packOf(cardSchema);

/** A built pack: public/content/packs/<categoryId>.json, every card with its `contentHash`. */
export const builtPackSchema = packOf(builtCardSchema);

export type Pack = z.infer<typeof packSchema>;
export type BuiltPack = z.infer<typeof builtPackSchema>;

// ---------------------------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------------------------

export const manifestEntrySchema = z.strictObject({
  packId: categoryId,
  packVersion: z.int().min(1),
  /** Digest of the built pack file. The importer downloads a pack when this changes. */
  hash: contentHash,
  cardCount: z.int().min(0),
});

/** public/content/manifest.json */
export const manifestSchema = z.array(manifestEntrySchema);

export type ManifestEntry = z.infer<typeof manifestEntrySchema>;
export type Manifest = z.infer<typeof manifestSchema>;
