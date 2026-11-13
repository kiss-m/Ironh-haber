import { act, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db.ts';
import { feedSession } from '../features/feed/session.ts';
import { resetPwaMock } from '../test/pwaRegisterMock.ts';
import { renderApp } from '../test/renderApp.tsx';
import { resetDb, seedContent, seedProfile } from '../test/seed.ts';
import { App } from './App.tsx';
import { ErrorScreen } from './ErrorScreen.tsx';
import { routes } from './routes.tsx';
import { THEME_STORAGE_KEY } from './storageKeys.ts';
import { useThemeStore } from './theme.ts';

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
  feedSession.reset();
});

describe('app shell', () => {
  it('opens on the feed with the four tabs in order', async () => {
    await renderApp();

    expect(heading()).toHaveTextContent('Feed');
    expect(await screen.findByRole('feed', { name: 'Feed kariet' })).toBeInTheDocument();
    const tabs = tabBar().getAllByRole('link');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Feed', 'Cesty', 'Zbierka', 'Postava']);
    expect(tabBar().getByRole('link', { name: 'Feed' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['Cesty', '/cesty', 'Cesty'],
    ['Zbierka', '/zbierka', 'Zbierka'],
    // The character screen is headed by the name of the character.
    ['Postava', '/postava', 'Skúšobná postava'],
  ])('opens %s from its tab', async (name, path, title) => {
    const { router, user } = await renderApp();

    await user.click(tabBar().getByRole('link', { name }));

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
    expect(tabBar().getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    expect(tabBar().getByRole('link', { name: 'Feed' })).not.toHaveAttribute('aria-current');
  });

  it('returns to the feed from another tab', async () => {
    const { user } = await renderApp('/zbierka');
    expect(heading()).toHaveTextContent('Zbierka');

    await user.click(tabBar().getByRole('link', { name: 'Feed' }));

    expect(await screen.findByRole('feed', { name: 'Feed kariet' })).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Feed');
  });

  it('sends an unknown address to the feed', async () => {
    const { router } = await renderApp('/neexistuje');

    expect(heading()).toHaveTextContent('Feed');
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

describe('character', () => {
  it('shows the name, level and rank of the character', async () => {
    await db.character.update('me', {
      totalXp: 300,
      attributeXp: { T: 250, R: 0, B: 0, M: 0, W: 50, J: 0 },
    });
    await renderApp('/postava');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Skúšobná postava' }),
    ).toBeInTheDocument();
    // 300 XP: 60 for level 1, 170 for level 2, and 70 into level 3.
    expect(screen.getByText('Úroveň 3 · Nováčik')).toBeInTheDocument();
    expect(screen.getByText('70 / 312 XP')).toBeInTheDocument();
  });

  it('lists the six attributes in the order of the taxonomy, each with its level', async () => {
    await db.character.update('me', {
      totalXp: 300,
      attributeXp: { T: 250, R: 0, B: 0, M: 0, W: 50, J: 0 },
    });
    await renderApp('/postava');
    const attributes = within(screen.getByRole('region', { name: 'Atribúty' }));
    await attributes.findByText('úr. 3');

    const items = attributes.getAllByRole('listitem').map((item) => item.firstChild?.textContent);
    // 250 XP in an attribute: 30 + 85 for two levels, 135 into the third. 50 XP: level 2.
    expect(items).toEqual([
      'Technikaúr. 3',
      'Riadenieúr. 1',
      'Biznisúr. 1',
      'Myseľúr. 1',
      'Rozhľadúr. 2',
      'Jazykyúr. 1',
    ]);
  });

  it('links to the settings', async () => {
    const { router, user } = await renderApp('/postava');

    await user.click(screen.getByRole('link', { name: 'Nastavenia' }));

    expect(router.state.location.pathname).toBe('/nastavenia');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nastavenia' }),
    ).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('switches the theme and remembers it under a kvant: key', async () => {
    const { user } = await renderApp('/nastavenia');
    const group = within(screen.getByRole('radiogroup', { name: 'Motív' }));
    expect(group.getByRole('radio', { name: 'Tmavý' })).toBeChecked();

    await user.click(group.getByRole('radio', { name: 'Svetlý' }));

    expect(group.getByRole('radio', { name: 'Svetlý' })).toBeChecked();
    expect(group.getByRole('radio', { name: 'Tmavý' })).not.toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(Object.keys(localStorage)).toEqual(['kvant:theme']);
  });

  it('saves the daily goal, the new-card cap and the retention at once', async () => {
    const { user } = await renderApp('/nastavenia');

    await user.click(screen.getByRole('radio', { name: /40 kariet/ }));
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Nové karty denne' })).getByRole('radio', {
        name: '20',
      }),
    );
    await user.click(screen.getByRole('radio', { name: '95 %' }));

    await vi.waitFor(async () => {
      expect(await db.settings.get('me')).toMatchObject({
        dailyGoal: 40,
        newCardCap: 20,
        desiredRetention: 0.95,
      });
    });
  });

  it('switches serendipity and German terms off', async () => {
    const { user } = await renderApp('/nastavenia');

    await user.click(screen.getByRole('switch', { name: 'Niečo iné' }));
    await user.click(screen.getByRole('switch', { name: 'Nemecké termíny' }));

    await vi.waitFor(async () => {
      expect(await db.settings.get('me')).toMatchObject({
        serendipity: false,
        showGermanTerms: false,
      });
    });
    expect(screen.getByRole('switch', { name: 'Niečo iné' })).not.toBeChecked();
  });

  it('removes a category from the feed but never the last one', async () => {
    const { user } = await renderApp('/nastavenia');
    const weights = async () => Object.keys((await db.settings.get('me'))!.categoryWeights).sort();

    await user.click(await screen.findByRole('checkbox', { name: /Robotika/ }));
    await vi.waitFor(async () => {
      expect(await weights()).toEqual(['ako-veci-funguju', 'fyzika-mechanika']);
    });
    // Its slider goes with it.
    expect(screen.queryByRole('slider', { name: /Robotika/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Fyzika a mechanika/ }));
    await vi.waitFor(async () => {
      expect(await weights()).toEqual(['ako-veci-funguju']);
    });

    await user.click(screen.getByRole('checkbox', { name: /Ako veci fungujú/ }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await weights()).toEqual(['ako-veci-funguju']);
    expect(screen.getByRole('checkbox', { name: /Ako veci fungujú/ })).toBeChecked();
  });

  it.each([
    ['the serendipity switch', () => screen.getByRole('switch', { name: 'Niečo iné' })],
    ['a category', () => screen.getByRole('checkbox', { name: /Robotika/ })],
    [
      'the new-card cap',
      () =>
        within(screen.getByRole('radiogroup', { name: 'Nové karty denne' })).getByRole('radio', {
          name: '20',
        }),
    ],
  ])('starts the feed over after %s changes what it serves', async (_name, control) => {
    const { router, user } = await renderApp();
    await screen.findByRole('article');
    expect(feedSession.useStore.getState().entries).toHaveLength(10);

    await act(() => router.navigate('/nastavenia'));
    await screen.findByRole('checkbox', { name: /Robotika/ });
    await user.click(control());

    // The queue was mixed with the old setting. The next visit to the feed builds a new one.
    await waitFor(() => {
      expect(feedSession.useStore.getState()).toMatchObject({ status: 'idle', entries: [] });
    });
  });

  it('leaves the feed alone when a setting does not change the mix', async () => {
    const { router, user } = await renderApp();
    await screen.findByRole('article');
    const queued = feedSession.useStore.getState().entries;

    await act(() => router.navigate('/nastavenia'));
    await user.click(await screen.findByRole('radio', { name: /40 kariet/ }));
    await user.click(screen.getByRole('radio', { name: '95 %' }));
    await user.click(screen.getByRole('switch', { name: 'Nemecké termíny' }));

    await vi.waitFor(async () => {
      expect(await db.settings.get('me')).toMatchObject({
        dailyGoal: 40,
        desiredRetention: 0.95,
        showGermanTerms: false,
      });
    });
    expect(feedSession.useStore.getState()).toMatchObject({ status: 'ready', entries: queued });
  });

  it('renames the character', async () => {
    const { user } = await renderApp('/nastavenia');
    // The field is filled in once the character has been read from the database.
    const input = await screen.findByDisplayValue('Skúšobná postava');
    expect(input).toHaveAccessibleName('Meno postavy');

    await user.clear(input);
    await user.type(input, 'Ada');
    await user.tab();

    await vi.waitFor(async () => {
      expect((await db.character.get('me'))?.name).toBe('Ada');
    });
  });

  it('reports the version and the imported cards', async () => {
    await renderApp('/nastavenia');
    const status = within(screen.getByRole('region', { name: 'Stav aplikácie' }));

    expect(status.getByText('Verzia').nextElementSibling).toHaveTextContent(/^\d+\.\d+\.\d+$/);
    expect(await status.findByText('pripravená')).toBeInTheDocument();
    expect(status.getByText('Karty v databáze').nextElementSibling).toHaveTextContent('60');
  });
});
