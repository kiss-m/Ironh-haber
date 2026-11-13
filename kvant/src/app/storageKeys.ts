/**
 * localStorage keys.
 *
 * Other apps are served from the same origin and share this storage. Every key Kvant writes
 * starts with `kvant:`, and Kvant never reads, lists or clears a key it does not own.
 */
export const STORAGE_PREFIX = 'kvant:';

/** Also read by the inline script in index.html. */
export const THEME_STORAGE_KEY = `${STORAGE_PREFIX}theme`;
