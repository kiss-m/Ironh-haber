import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db.ts';
import { resetPwaMock } from '../test/pwaRegisterMock.ts';
import { resetDb, seedContent, seedProfile } from '../test/seed.ts';
import { App } from './App.tsx';
import { ErrorScreen } from './ErrorScreen.tsx';
import { routes } from './routes.tsx';
import { THEME_STORAGE_KEY } from './storageKeys.ts';
import { useThemeStore } from './theme.ts';

vi.mock('virtual:pwa-register/react', () => import('../test/pwaRegisterMock.ts'));

/** Renders the app and waits until the start-up gate has let a screen through. */
async function renderApp(initialPath = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  render(<App router={router} />);
  await screen.findByRole('heading', { level: 1 });
  return { router, user: userEvent.setup() };
}

function tabBar() {
  return within(screen.getByRole('navigation', { name: 'Hlavná navigácia' }));
}

function heading() {
  return screen.getByRole('heading', { level: 1 });
}

beforeEach(async () => {
  resetPwaMock();
  localStorage.clear();
  useThemeStore.getState().setTheme('dark');
  await resetDb();
  await seedContent();
  await seedProfile();
});

describe('app shell', () => {
  it('opens on the feed with the four tabs in order', async () => {
    await renderApp();

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
    const { router, user } = await renderApp();

    await user.click(tabBar().getByRole('link', { name }));

    expect(heading()).toHaveTextContent(name);
    expect(router.state.location.pathname).toBe(path);
    expect(tabBar().getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    expect(tabBar().getByRole('link', { name: 'Feed' })).not.toHaveAttribute('aria-current');
  });

  it('returns to the feed from another tab', async () => {
    const { user } = await renderApp('/zbierka');
    expect(heading()).toHaveTextContent('Zbierka');

    await user.click(tabBar().getByRole('link', { name: 'Feed' }));

    expect(heading()).toHaveTextContent('Karty sú na ceste.');
  });

  it('sends an unknown address to the feed', async () => {
    const { router } = await renderApp('/neexistuje');

    expect(heading()).toHaveTextContent('Karty sú na ceste.');
    expect(router.state.location.pathname).toBe('/');
  });

  it('moves the focus into the new screen after a tab change', async () => {
    const { user } = await renderApp();
    const main = screen.getByRole('main');
    expect(main).not.toHaveFocus();

    await user.click(tabBar().getByRole('link', { name: 'Cesty' }));

    expect(main).toHaveFocus();
  });
});

describe('start-up gate', () => {
  it('sends a reader without a character to onboarding', async () => {
    await db.character.clear();
    const { router } = await renderApp('/zbierka');

    expect(router.state.location.pathname).toBe('/vitaj');
    expect(heading()).toHaveTextContent('Ako sa bude volať tvoja postava?');
    // Onboarding stands alone, without the tab bar.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('keeps a reader with a character away from onboarding', async () => {
    const { router } = await renderApp('/vitaj');

    expect(router.state.location.pathname).toBe('/');
  });

  it('explains a first start without a connection and offers to try again', async () => {
    await resetDb();
    const { user } = await renderApp();

    // Nothing is stored and the content cannot be fetched in the test environment.
    expect(screen.getByRole('alert')).toHaveTextContent('Karty sa nepodarilo načítať.');

    // The content arrives in the meantime, so the second attempt gets through.
    await seedContent();
    await seedProfile();
    await user.click(screen.getByRole('button', { name: 'Skúsiť znova' }));

    expect(await screen.findByRole('navigation', { name: 'Hlavná navigácia' })).toBeInTheDocument();
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
  it('reports the version and the imported cards', async () => {
    await renderApp();
    const status = within(screen.getByRole('region', { name: 'Stav aplikácie' }));

    expect(status.getByText('Verzia').nextElementSibling).toHaveTextContent(/^\d+\.\d+\.\d+$/);
    expect(await status.findByText('pripravená')).toBeInTheDocument();
    expect(status.getByText('Karty v databáze').nextElementSibling).toHaveTextContent('60');
  });
});

describe('character placeholder', () => {
  it('lists the six attributes in the order of the taxonomy', async () => {
    await renderApp('/postava');
    const attributes = within(screen.getByRole('region', { name: 'Atribúty' }));

    const names = attributes.getAllByRole('listitem').map((item) => item.firstChild?.textContent);
    expect(names).toEqual(['Technika', 'Riadenie', 'Biznis', 'Myseľ', 'Rozhľad', 'Jazyky']);
  });

  it('switches the theme and remembers it under a kvant: key', async () => {
    const { user } = await renderApp('/postava');
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
