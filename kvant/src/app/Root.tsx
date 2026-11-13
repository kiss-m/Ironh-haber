import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, Outlet, useLocation } from 'react-router';
import { db } from '../data/db.ts';
import { PATHS } from './paths.ts';
import { Splash } from './Splash.tsx';
import { useContentSync } from './useContentSync.ts';

/**
 * The gate every screen sits behind. It waits for the content, and it sends a reader without a
 * character to onboarding and a reader with one away from it.
 */
export function Root() {
  const content = useContentSync();
  // `undefined` while the query runs, `null` when there is no character yet.
  const character = useLiveQuery(async () => (await db.character.get('me')) ?? null);
  const { pathname } = useLocation();

  if (content.status === 'error') return <Splash onRetry={content.retry} />;
  if (content.status === 'loading' || character === undefined) return <Splash />;

  if (character === null && pathname !== PATHS.onboarding) {
    return <Navigate to={PATHS.onboarding} replace />;
  }
  if (character !== null && pathname === PATHS.onboarding) {
    return <Navigate to={PATHS.feed} replace />;
  }
  return <Outlet />;
}
