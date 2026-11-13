/**
 * Hash routes: https://<user>.github.io/kvant/#/zbierka. Hash routing needs no server rewrites,
 * which is what GitHub Pages can offer. The slugs are Slovak because the address bar shows them.
 */
export const PATHS = {
  feed: '/',
  paths: '/cesty',
  collection: '/zbierka',
  character: '/postava',
  settings: '/nastavenia',
  onboarding: '/vitaj',
  review: '/opakovanie',
  done: '/dnes',
} as const;
