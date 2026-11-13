/**
 * Loads content into IndexedDB from the app's own origin.
 *
 * The files under content/ are precached by the service worker together with the app shell, so
 * the manifest read here always belongs to the running app version, and it is available offline
 * once the app has been opened a single time.
 */
import { db, type KvantDb } from './db.ts';
import { importContent, type ContentSource, type ImportResult } from './importer.ts';

/** A content directory served over HTTP. `baseUrl` ends with a slash. */
export function httpSource(baseUrl: string): ContentSource {
  return {
    async load(path) {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) throw new Error(`${response.status} for ${path}`);
      return (await response.json()) as unknown;
    },
  };
}

const running = new WeakMap<KvantDb, Promise<ImportResult>>();

/**
 * Imports whatever changed. Calls that overlap share one run, so that the start of the app and
 * an "online" event at the same moment cannot import twice.
 */
export function syncContent(
  database: KvantDb = db,
  source: ContentSource = httpSource(`${import.meta.env.BASE_URL}content/`),
): Promise<ImportResult> {
  const current = running.get(database);
  if (current) return current;
  const run = importContent(database, source, new Date()).finally(() => {
    running.delete(database);
  });
  running.set(database, run);
  return run;
}
