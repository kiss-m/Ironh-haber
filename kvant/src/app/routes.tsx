import { Navigate, type RouteObject } from 'react-router';
import { CharacterScreen } from '../features/character/CharacterScreen.tsx';
import { CollectionScreen } from '../features/collection/CollectionScreen.tsx';
import { FeedScreen } from '../features/feed/FeedScreen.tsx';
import { PathsScreen } from '../features/paths/PathsScreen.tsx';
import { AppLayout } from './AppLayout.tsx';
import { ErrorScreen } from './ErrorScreen.tsx';
import { PATHS } from './paths.ts';

export const routes: RouteObject[] = [
  {
    path: PATHS.feed,
    element: <AppLayout />,
    errorElement: <ErrorScreen />,
    children: [
      { index: true, element: <FeedScreen /> },
      { path: PATHS.paths, element: <PathsScreen /> },
      { path: PATHS.collection, element: <CollectionScreen /> },
      { path: PATHS.character, element: <CharacterScreen /> },
      // An unknown hash, for example from an old link, opens the feed.
      { path: '*', element: <Navigate to={PATHS.feed} replace /> },
    ],
  },
];
