import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { App } from '../app/App.tsx';
import { routes } from '../app/routes.tsx';

/** Renders the whole app at a path and waits until the start-up gate has let a screen through. */
export async function renderApp(initialPath = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  render(<App router={router} />);
  await screen.findByRole('heading', { level: 1 });
  return { router, user: userEvent.setup() };
}
