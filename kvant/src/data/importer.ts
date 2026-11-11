/**
 * The content importer (docs/SPEC.md section 5.4, step 6).
 *
 * It reads the manifest, loads the packs whose hash changed, and writes categories, topics and
 * cards in one transaction. Cards that left their pack are archived, not deleted, because the
 * reader's state may still refer to them.
 *
 * The importer never touches user state, with the one exception the spec asks for: a flagged
 * card whose content changed is unflagged, since the flag was about the old text.
 */
import { builtPackSchema, manifestSchema, type BuiltPack } from '../../shared/schema.ts';
import type { KvantDb } from './db.ts';
import type { CardRow, TopicRow } from './types.ts';

/** Where the manifest and the packs come from. The app fetches them, tests hand them over. */
export interface ContentSource {
  /** Loads and parses a JSON file by its path inside the content directory. */
  load(path: string): Promise<unknown>;
}

export interface ImportResult {
  /** Packs that were written, new or changed. */
  imported: string[];
  /** Packs whose hash matched what is already stored. */
  unchanged: string[];
  /** Packs that left the manifest. Their cards were archived. */
  removed: string[];
  /** Packs that could not be loaded or were invalid. What was stored before stays in place. */
  failed: { packId: string; reason: string }[];
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadPack(source: ContentSource, packId: string): Promise<BuiltPack> {
  const pack = builtPackSchema.parse(await source.load(`packs/${packId}.json`));
  if (pack.packId !== packId) {
    throw new Error(`the file for "${packId}" contains the pack "${pack.packId}"`);
  }
  return pack;
}

/**
 * Brings the content tables in line with the manifest. Throws only when the manifest itself
 * cannot be loaded or is invalid. A single broken pack is reported in `failed` and skipped.
 */
export async function importContent(
  db: KvantDb,
  source: ContentSource,
  now: Date,
): Promise<ImportResult> {
  const manifest = manifestSchema.parse(await source.load('manifest.json'));
  const stored = new Map((await db.contentMeta.toArray()).map((meta) => [meta.packId, meta]));

  const result: ImportResult = { imported: [], unchanged: [], removed: [], failed: [] };
  const changed: { pack: BuiltPack; hash: string }[] = [];

  // Network first, database after: an IndexedDB transaction cannot wait for a fetch.
  for (const entry of manifest) {
    if (stored.get(entry.packId)?.hash === entry.hash) {
      result.unchanged.push(entry.packId);
      continue;
    }
    try {
      changed.push({ pack: await loadPack(source, entry.packId), hash: entry.hash });
    } catch (error) {
      result.failed.push({ packId: entry.packId, reason: reasonOf(error) });
    }
  }

  const listed = new Set(manifest.map((entry) => entry.packId));
  const removed = [...stored.keys()].filter((packId) => !listed.has(packId));

  if (changed.length === 0 && removed.length === 0) return result;

  await db.transaction(
    'rw',
    [db.categories, db.topics, db.cards, db.contentMeta, db.cardState],
    async () => {
      for (const { pack, hash } of changed) {
        const categoryId = pack.packId;
        await db.categories.put(pack.category);

        const topics: TopicRow[] = pack.topics.map((topic) => ({ ...topic, categoryId }));
        const keptTopics = new Set(topics.map((topic) => topic.id));
        const staleTopics = (
          await db.topics.where('categoryId').equals(categoryId).primaryKeys()
        ).filter((topicId) => !keptTopics.has(topicId));
        await db.topics.bulkDelete(staleTopics);
        await db.topics.bulkPut(topics);

        const before = new Map(
          (await db.cards.where('categoryId').equals(categoryId).toArray()).map((card) => [
            card.id,
            card,
          ]),
        );
        const cards: CardRow[] = pack.cards.map((card) => ({
          ...card,
          categoryId,
          archived: false,
        }));
        const kept = new Set(cards.map((card) => card.id));

        const departed = [...before.values()].filter(
          (card) => !kept.has(card.id) && !card.archived,
        );
        await db.cards.bulkPut(departed.map((card) => ({ ...card, archived: true })));

        const rewritten = cards
          .filter((card) => {
            const previous = before.get(card.id);
            return previous !== undefined && previous.contentHash !== card.contentHash;
          })
          .map((card) => card.id);
        await db.cardState
          .where('cardId')
          .anyOf(rewritten)
          .modify((state) => {
            state.flagged = null;
          });

        await db.cards.bulkPut(cards);
        await db.contentMeta.put({
          packId: categoryId,
          version: pack.packVersion,
          hash,
          importedAt: now.getTime(),
        });
        result.imported.push(categoryId);
      }

      for (const packId of removed) {
        await db.cards
          .where('categoryId')
          .equals(packId)
          .modify((card) => {
            card.archived = true;
          });
        await db.contentMeta.delete(packId);
        result.removed.push(packId);
      }
    },
  );

  return result;
}
