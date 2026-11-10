/**
 * Builds the content the app loads.
 *
 *   npm run content:build
 *
 * Reads the source packs in content/packs/, validates them, stamps every card with a content
 * hash and writes public/content/packs/<packId>.json together with public/content/manifest.json.
 * The output is generated, so it is not committed: `npm run dev` and `npm run build` run this
 * first.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { manifestSchema, type ManifestEntry } from '../shared/schema.ts';
import { buildPack, manifestEntry, serializePack, validatePack } from './content-lib.ts';

const root = new URL('../', import.meta.url);
const sourceDir = new URL('content/packs/', root);
const outputDir = new URL('public/content/', root);
const outputPacksDir = new URL('packs/', outputDir);

const fileNames = (await readdir(sourceDir)).filter((name) => name.endsWith('.json')).sort();

const manifest: ManifestEntry[] = [];
const outputs: { fileName: string; text: string }[] = [];
let failed = false;

for (const fileName of fileNames) {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(new URL(fileName, sourceDir), 'utf8'));
  } catch (error) {
    console.error(
      `✖ ${fileName}: not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
    failed = true;
    continue;
  }

  const result = validatePack(raw, fileName);
  if (!result.ok) {
    console.error(`✖ ${fileName}`);
    for (const message of result.errors) console.error(`    ${message}`);
    failed = true;
    continue;
  }

  const built = buildPack(result.pack);
  const text = serializePack(built);
  outputs.push({ fileName, text });
  manifest.push(manifestEntry(built, text));
}

if (failed) {
  console.error('\nContent build failed. Nothing was written.');
  process.exit(1);
}

// Write only once everything is valid, and leave no pack behind that no longer has a source.
await rm(outputPacksDir, { recursive: true, force: true });
await mkdir(outputPacksDir, { recursive: true });
for (const { fileName, text } of outputs) {
  await writeFile(new URL(fileName, outputPacksDir), text);
}
await writeFile(
  new URL('manifest.json', outputDir),
  `${JSON.stringify(manifestSchema.parse(manifest))}\n`,
);

for (const entry of manifest) {
  console.log(`✔ ${entry.packId}  v${entry.packVersion}  ${entry.cardCount} cards  ${entry.hash}`);
}
const total = manifest.reduce((sum, entry) => sum + entry.cardCount, 0);
console.log(`${manifest.length} packs, ${total} cards → public/content/`);
