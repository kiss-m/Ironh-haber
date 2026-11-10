import { MotionConfig } from 'motion/react';
import { createHashRouter, type DataRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { PwaToasts } from './PwaToasts.tsx';
import { routes } from './routes.tsx';

const hashRouter = createHashRouter(routes);

interface AppProps {
  /** Tests pass a memory router. The app itself uses the hash router. */
  router?: DataRouter;
}

export function App({ router = hashRouter }: AppProps) {
  return (
    // "user": animations follow the system's reduced-motion setting.
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
      <PwaToasts />
    </MotionConfig>
  );
}
