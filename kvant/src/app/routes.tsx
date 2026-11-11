import { Navigate, type RouteObject } from 'react-router';
import { CharacterScreen } from '../features/character/CharacterScreen.tsx';
import { CollectionScreen } from '../features/collection/CollectionScreen.tsx';
import { DoneScreen } from '../features/feed/DoneScreen.tsx';
import { FeedScreen } from '../features/feed/FeedScreen.tsx';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen.tsx';
import { PathsScreen } from '../features/paths/PathsScreen.tsx';
import { AppLayout } from './AppLayout.tsx';
import { ErrorScreen } from './ErrorScreen.tsx';
import { PATHS } from './paths.ts';
import { Root } from './Root.tsx';

export const routes: RouteObject[] = [
  {
    // Every screen sits behind the gate: content first, then a character.
    element: <Root />,
    errorElement: <ErrorScreen />,
    children: [
      { path: PATHS.onboarding, element: <OnboardingScreen /> },
      { path: PATHS.done, element: <DoneScreen /> },
      {
        // The four main screens share the tab bar.
        element: <AppLayout />,
        children: [
          { path: PATHS.feed, element: <FeedScreen /> },
          { path: PATHS.paths, element: <PathsScreen /> },
          { path: PATHS.collection, element: <CollectionScreen /> },
          { path: PATHS.character, element: <CharacterScreen /> },
        ],
      },
      // An unknown hash, for example from an old link, opens the feed.
      { path: '*', element: <Navigate to={PATHS.feed} replace /> },
    ],
  },
];
