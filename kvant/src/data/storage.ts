/**
 * Persistent storage. Without it the browser may evict IndexedDB when the device runs low on
 * space, and with it would go the reader's whole progress.
 */

/** Asks the browser to keep Kvant's data. Null where the browser cannot tell or does not ask. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    // Older browsers lack the method, so check before calling it.
    if (typeof navigator.storage.persist !== 'function') return null;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/** Whether the data is already protected from eviction. Null where the browser cannot tell. */
export async function isPersisted(): Promise<boolean | null> {
  try {
    if (typeof navigator.storage.persisted !== 'function') return null;
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
