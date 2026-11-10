import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPwaMock } from '../test/pwaRegisterMock.ts';
import { App } from './App.tsx';
import { ErrorScreen } from './ErrorScreen.tsx';
import { routes } from './routes.tsx';
import { THEME_STORAGE_KEY } from './storageKeys.ts';
import { useThemeStore } from './theme.ts';

vi.mock('virtual:pwa-register/react', () => import('../test/pwaRegisterMock.ts'));

function renderApp(initialPath = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  render(<App router={router} />);
  return { router, user: userEvent.setup() };
}

function tabBar() {
  return within(screen.getByRole('navigation', { name: 'Hlavná navigácia' }));
}

function heading() {
  return screen.getByRole('heading', { level: 1 });
}

beforeEach(() => {
  resetPwaMock();
  localStorage.clear();
  useThemeStore.getState().setTheme('dark');
});

describe('app shell', () => {
  it('opens on the feed with the four tabs in order', () => {
    renderApp();

    expect(heading()).toHaveTextContent('Karty sú na ceste.');
    const tabs = tabBar().getAllByRole('link');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Feed', 'Cesty', 'Zbierka', 'Postava']);
    expect(tabBar().getByRole('link', { name: 'Feed' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['Cesty', '/cesty'],
    ['Zbierka', '/zbierka'],
    ['Postava', '/postava'],
  ])('opens %s from its tab', async (name, path) => {
    const { router, user } = renderApp();

    await user.click(tabBar().getByRole('link', { name }));

    expect(heading()).toHaveTextContent(name);
    expect(router.state.location.pathname).toBe(path);
    expect(tabBar().getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    expect(tabBar().getByRole('link', { name: 'Feed' })).not.toHaveAttribute('aria-current');
  });

  it('returns to the feed from another tab', async () => {
    const { user } = renderApp('/zbierka');
    expect(heading()).toHaveTextContent('Zbierka');

    await user.click(tabBar().getByRole('link', { name: 'Feed' }));

    expect(heading()).toHaveTextContent('Karty sú na ceste.');
  });

  it('sends an unknown address to the feed', () => {
    const { router } = renderApp('/neexistuje');

    expect(heading()).toHaveTextContent('Karty sú na ceste.');
    expect(router.state.location.pathname).toBe('/');
  });

  it('moves the focus into the new screen after a tab change', async () => {
    const { user } = renderApp();
    const main = screen.getByRole('main');
    expect(main).not.toHaveFocus();

    await user.click(tabBar().getByRole('link', { name: 'Cesty' }));

    expect(main).toHaveFocus();
  });
});

describe('error screen', () => {
  it('replaces a screen that throws with a Slovak message and a way out', () => {
    function Broken(): never {
      throw new Error('boom');
    }
    // React and the router both report the error. Keep that out of the test output.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([
      { path: '/', element: <Broken />, errorElement: <ErrorScreen /> },
    ]);

    render(<App router={router} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Niečo sa pokazilo.');
    expect(screen.getByRole('button', { name: 'Načítať znova' })).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('is what the app routes fall back to', () => {
    expect(routes[0]?.errorElement).toBeDefined();
  });
});

describe('feed placeholder', () => {
  it('reports the version and an open, empty database', async () => {
    renderApp();
    const status = within(screen.getByRole('region', { name: 'Stav aplikácie' }));

    expect(status.getByText('Verzia').nextElementSibling).toHaveTextContent(/^\d+\.\d+\.\d+$/);
    expect(await status.findByText('pripravená')).toBeInTheDocument();
    expect(status.getByText('Karty v databáze').nextElementSibling).toHaveTextContent('0');
  });
});

describe('character placeholder', () => {
  it('lists the six attributes in the order of the taxonomy', () => {
    renderApp('/postava');
    const attributes = within(screen.getByRole('region', { name: 'Atribúty' }));

    const names = attributes.getAllByRole('listitem').map((item) => item.firstChild?.textContent);
    expect(names).toEqual(['Technika', 'Riadenie', 'Biznis', 'Myseľ', 'Rozhľad', 'Jazyky']);
  });

  it('switches the theme and remembers it under a kvant: key', async () => {
    const { user } = renderApp('/postava');
    const group = within(screen.getByRole('radiogroup', { name: 'Motív' }));
    expect(group.getByRole('radio', { name: 'Tmavý' })).toBeChecked();

    await user.click(group.getByRole('radio', { name: 'Svetlý' }));

    expect(group.getByRole('radio', { name: 'Svetlý' })).toBeChecked();
    expect(group.getByRole('radio', { name: 'Tmavý' })).not.toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(Object.keys(localStorage)).toEqual(['kvant:theme']);
  });
});
