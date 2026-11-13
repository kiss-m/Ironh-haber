/**
 * The pure part of the content build: validating a source pack, stamping every card with a
 * content hash and describing the result in the manifest. `content-build.ts` adds the file I/O.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { packSchema, type BuiltPack, type ManifestEntry, type Pack } from '../shared/schema.ts';
import { findCategory } from '../shared/taxonomy.ts';

/** JSON with object keys in sorted order, so that equal content always gives equal text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** A short hex digest. Sixteen hex digits are plenty to notice that content has changed. */
export function digest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

export type Validation = { ok: true; pack: Pack } | { ok: false; errors: string[] };

/**
 * Checks one source pack: the schema, that the file is named after its pack, and that the
 * category is the one the taxonomy defines.
 */
export function validatePack(raw: unknown, fileName: string): Validation {
  const parsed = packSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = describePath(raw, issue.path);
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }

  const pack = parsed.data;
  const errors: string[] = [];
  if (fileName !== `${pack.packId}.json`) {
    errors.push(`the file must be named ${pack.packId}.json, after its packId`);
  }
  const definition = findCategory(pack.packId);
  if (!definition) {
    errors.push(`"${pack.packId}" is not a category in shared/taxonomy.ts`);
  } else {
    if (definition.name !== pack.category.name) {
      errors.push(`category.name must be "${definition.name}", as in shared/taxonomy.ts`);
    }
    if (definition.attribute !== pack.category.attribute) {
      errors.push(`category.attribute must be "${definition.attribute}", as in shared/taxonomy.ts`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, pack };
}

/** Turns ["cards", 12, "body"] into "cards[12] (robotika.zaklady.tcp).body". */
function describePath(raw: unknown, path: readonly PropertyKey[]): string {
  let text = '';
  let cursor: unknown = raw;
  for (const key of path) {
    cursor =
      cursor !== null && typeof cursor === 'object'
        ? (cursor as Record<PropertyKey, unknown>)[key]
        : undefined;
    if (typeof key === 'number') {
      text += `[${key}]`;
      const id = z.object({ id: z.string() }).safeParse(cursor);
      if (id.success) text += ` (${id.data.id})`;
    } else {
      text += text ? `.${String(key)}` : String(key);
    }
  }
  return text;
}

/** Adds a `contentHash` to every card. The hash covers the whole card, in canonical form. */
export function buildPack(pack: Pack): BuiltPack {
  return {
    ...pack,
    cards: pack.cards.map((card) => ({ ...card, contentHash: digest(canonicalJson(card)) })),
  };
}

/** The text of a built pack file. */
export function serializePack(pack: BuiltPack): string {
  return `${JSON.stringify(pack)}\n`;
}

/** The manifest entry of a built pack. `fileText` is exactly what is written to disk. */
export function manifestEntry(pack: BuiltPack, fileText: string): ManifestEntry {
  return {
    packId: pack.packId,
    packVersion: pack.packVersion,
    hash: digest(fileText),
    cardCount: pack.cards.length,
  };
}
