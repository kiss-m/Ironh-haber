/** Fills the app's database for UI tests: the real seed packs and, if wanted, a profile. */
import akoVeciFunguju from '../../content/packs/ako-veci-funguju.json';
import fyzikaMechanika from '../../content/packs/fyzika-mechanika.json';
import robotika from '../../content/packs/robotika.json';
import { packSchema, type BuiltPack } from '../../shared/schema.ts';
import { forgetContentIndex } from '../data/content.ts';
import { db } from '../data/db.ts';
import { importContent, type ContentSource } from '../data/importer.ts';
import { createProfile, type ProfileInput } from '../data/profile.ts';

/** The packs from content/packs/, with a stand-in hash on every card. */
export function seedPacks(): BuiltPack[] {
  return [akoVeciFunguju, fyzikaMechanika, robotika].map((raw) => {
    const pack = packSchema.parse(raw);
    return {
      ...pack,
      cards: pack.cards.map((card, index) => ({
        ...card,
        contentHash: (index + 1).toString(16).padStart(16, '0'),
      })),
    };
  });
}

function sourceOf(packs: BuiltPack[]): ContentSource {
  const files = new Map<string, unknown>([
    [
      'manifest.json',
      packs.map((pack) => ({
        packId: pack.packId,
        packVersion: pack.packVersion,
        hash: pack.cards.length.toString(16).padStart(16, '0'),
        cardCount: pack.cards.length,
      })),
    ],
    ...packs.map((pack): [string, unknown] => [`packs/${pack.packId}.json`, pack]),
  ]);
  return { load: (path) => Promise.resolve(structuredClone(files.get(path))) };
}

/** Empties every table of the app database. */
export async function resetDb(): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()));
  forgetContentIndex(db);
}

/** Imports packs into the app database: the real seed packs unless others are given. */
export async function seedContent(
  now: Date = new Date(),
  packs: BuiltPack[] = seedPacks(),
): Promise<void> {
  const result = await importContent(db, sourceOf(packs), now);
  const broken = result.failed[0];
  if (broken) throw new Error(`Pack ${broken.packId} did not import: ${broken.reason}`);
}

export async function seedProfile(
  overrides: Partial<ProfileInput> = {},
  now: Date = new Date(),
): Promise<void> {
  await createProfile(
    db,
    {
      name: 'Skúšobná postava',
      categoryWeights: { 'ako-veci-funguju': 50, 'fyzika-mechanika': 50, robotika: 50 },
      dailyGoal: 20,
      theme: 'dark',
      ...overrides,
    },
    now,
  );
}
