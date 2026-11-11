import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App.tsx';
import { routes } from '../../app/routes.tsx';
import { db } from '../../data/db.ts';
import { feedSession } from '../feed/session.ts';
import { resetPwaMock } from '../../test/pwaRegisterMock.ts';
import { resetDb, seedContent } from '../../test/seed.ts';

vi.mock('virtual:pwa-register/react', () => import('../../test/pwaRegisterMock.ts'));

async function openOnboarding() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  render(<App router={router} />);
  await screen.findByRole('heading', { level: 1, name: 'Ako sa bude volať tvoja postava?' });
  return { router, user: userEvent.setup() };
}

function heading() {
  return screen.getByRole('heading', { level: 1 });
}

const next = () => screen.getByRole('button', { name: 'Ďalej' });

beforeEach(async () => {
  resetPwaMock();
  await resetDb();
  await seedContent();
  feedSession.reset();
});

describe('onboarding', () => {
  it('asks for a name before moving on', async () => {
    const { user } = await openOnboarding();
    expect(screen.getByText('Krok 1 z 4')).toBeInTheDocument();

    await user.click(next());

    expect(screen.getByRole('alert')).toHaveTextContent('Postava potrebuje meno.');
    expect(heading()).toHaveTextContent('Ako sa bude volať tvoja postava?');

    await user.type(screen.getByRole('textbox', { name: 'Meno postavy' }), '   ');
    await user.click(next());
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('offers the categories grouped by attribute, with the starter set preselected', async () => {
    const { user } = await openOnboarding();
    await user.type(screen.getByRole('textbox', { name: 'Meno postavy' }), 'Ada');
    await user.click(next());

    expect(heading()).toHaveTextContent('Čo sa chceš učiť?');
    const groups = screen.getAllByRole('group');
    expect(
      groups.map((group) => within(group).getByText(/^(Technika|Rozhľad)$/).textContent),
    ).toEqual(['Technika', 'Rozhľad']);
    const technika = within(screen.getByRole('group', { name: 'Technika' }));
    expect(technika.getByRole('checkbox', { name: /Fyzika a mechanika/ })).toBeChecked();
    expect(technika.getByRole('checkbox', { name: /Robotika/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ako veci fungujú/ })).toBeChecked();
  });

  it('needs at least one category', async () => {
    const { user } = await openOnboarding();
    await user.type(screen.getByRole('textbox', { name: 'Meno postavy' }), 'Ada');
    await user.click(next());
    for (const box of screen.getAllByRole('checkbox')) await user.click(box);

    await user.click(next());

    expect(screen.getByRole('alert')).toHaveTextContent('Vyber aspoň jednu kategóriu.');
    expect(heading()).toHaveTextContent('Čo sa chceš učiť?');
  });

  it('creates the character and the settings and opens the feed', async () => {
    const { router, user } = await openOnboarding();

    await user.type(screen.getByRole('textbox', { name: 'Meno postavy' }), '  Ada  ');
    await user.click(next());

    // Leave robotics out.
    await user.click(screen.getByRole('checkbox', { name: /Robotika/ }));
    await user.click(next());

    expect(heading()).toHaveTextContent('Čomu dáš viac priestoru?');
    const sliders = screen.getAllByRole('slider');
    expect(sliders.map((slider) => slider.getAttribute('aria-valuetext'))).toEqual([
      'bežne',
      'bežne',
    ]);
    expect(screen.queryByRole('slider', { name: /Robotika/ })).not.toBeInTheDocument();
    await user.click(next());

    expect(heading()).toHaveTextContent('Koľko kariet denne?');
    expect(screen.getByRole('radio', { name: /20 kariet/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /10 kariet/ }));
    await user.click(screen.getByRole('button', { name: 'Začať' }));

    await screen.findByRole('navigation', { name: 'Hlavná navigácia' });
    expect(router.state.location.pathname).toBe('/');
    expect(await db.character.get('me')).toMatchObject({
      name: 'Ada',
      totalXp: 0,
      attributeXp: { T: 0, R: 0, B: 0, M: 0, W: 0, J: 0 },
    });
    expect(await db.settings.get('me')).toMatchObject({
      categoryWeights: { 'ako-veci-funguju': 50, 'fyzika-mechanika': 50 },
      dailyGoal: 10,
      newCardCap: 40,
      desiredRetention: 0.9,
      serendipity: true,
      theme: 'dark',
    });
  });

  it('lets the reader go back without losing what was entered', async () => {
    const { user } = await openOnboarding();
    await user.type(screen.getByRole('textbox', { name: 'Meno postavy' }), 'Ada');
    await user.click(next());
    await user.click(screen.getByRole('checkbox', { name: /Robotika/ }));

    await user.click(screen.getByRole('button', { name: 'Späť' }));
    expect(screen.getByRole('textbox', { name: 'Meno postavy' })).toHaveValue('Ada');

    await user.click(next());
    expect(screen.getByRole('checkbox', { name: /Robotika/ })).not.toBeChecked();
  });
});
