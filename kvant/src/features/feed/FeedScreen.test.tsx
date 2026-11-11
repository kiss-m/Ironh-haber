import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { learningDay } from '../../core/day.ts';
import { seededRng } from '../../core/testing.ts';
import { db } from '../../data/db.ts';
import { recordSeen } from '../../data/progress.ts';
import { kindOf, packOf, smallPacks } from '../../test/packs.ts';
import { renderApp } from '../../test/renderApp.tsx';
import { resetDb, seedContent, seedProfile } from '../../test/seed.ts';
import { feedSession } from './session.ts';

const READING_ACTIONS = ['Viac takého', 'Uložiť', 'Už viem', 'Nerozumiem', 'Chyba'];
const QUESTION_ACTIONS = ['Viac takého', 'Uložiť', 'Chyba'];

/** The card on screen. The pages around it are rendered too, but hidden from the tree. */
function card(): HTMLElement {
  return screen.getByRole('article');
}

/** The id of the card on screen. Cards of the test packs carry their id as the title. */
function cardId(): string {
  return card().getAttribute('aria-label') ?? '';
}

function actions() {
  return within(within(card()).getByRole('group', { name: 'Akcie ku karte' }));
}

function action(name: string): HTMLElement {
  return actions().getByRole('button', { name });
}

const today = () => db.daily.get(learningDay(new Date()));

/** The "+5 XP" that floats up under the status corner. A checkpoint shows XP figures too. */
function xpFloat(text: string): Promise<HTMLElement> {
  return screen.findByText(text, { selector: '[aria-live] span' });
}

/** Swipes to the next page, the way the arrow key does on a keyboard. */
async function swipe(user: UserEvent): Promise<void> {
  const before = feedSession.useStore.getState().pageIndex;
  screen.getByRole('feed', { name: 'Feed kariet' }).focus();
  await user.keyboard('{ArrowDown}');
  await waitFor(() => {
    expect(feedSession.useStore.getState().pageIndex).toBe(before + 1);
  });
}

/** Swipes forward to the first card whose kind is one of the letters (see test/packs.ts). */
async function goTo(user: UserEvent, kinds: string): Promise<string> {
  for (let step = 0; step < 10; step += 1) {
    await screen.findByRole('article');
    if (kinds.includes(kindOf(cardId()))) return cardId();
    await swipe(user);
  }
  throw new Error(`No card of kind "${kinds}" among the first ten.`);
}

async function open(path = '/') {
  const app = await renderApp(path);
  await screen.findByRole('article');
  return app;
}

beforeEach(async () => {
  vi.spyOn(Math, 'random').mockImplementation(seededRng(7));
  await resetDb();
  await seedContent(new Date(), smallPacks());
  await seedProfile();
  feedSession.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a card in the feed', () => {
  it('shows what it is, where it belongs, and the day so far', async () => {
    await open();

    const id = cardId();
    const categoryId = id.slice(0, id.indexOf('.'));
    expect(await within(card()).findByText(`Kategória ${categoryId}`)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dnes 0 z 20 kariet' })).toBeInTheDocument();
    expect(screen.getByLabelText('Úroveň 1')).toHaveTextContent('1');
    // Nothing is due on the first day, so there is no way into a review session yet.
    expect(screen.queryByRole('link', { name: /Opakovania/ })).not.toBeInTheDocument();
  });

  it('offers "Už viem" and "Nerozumiem" on a reading, but not on a question', async () => {
    const { user } = await open();

    await goTo(user, 'ced');
    expect(
      actions()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(READING_ACTIONS);

    await goTo(user, 'qm');
    expect(
      actions()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(QUESTION_ACTIONS);
  });

  it('labels each kind of card', async () => {
    const { user } = await open();
    const labels: Record<string, string> = {
      c: 'Koncept',
      e: 'Z praxe',
      d: 'Vedel si?',
      m: 'Mýtus vs. realita',
      q: 'Kvíz',
    };

    const kinds = new Set<string>();
    for (let step = 0; step < 10; step += 1) {
      await screen.findByRole('article');
      const kind = kindOf(cardId());
      expect(within(card()).getByText(labels[kind]!)).toBeInTheDocument();
      kinds.add(kind);
      await swipe(user);
    }
    // The first ten cards of the test content hold every kind.
    expect([...kinds].sort()).toEqual(['c', 'd', 'e', 'm', 'q']);
  });
});

describe('reading', () => {
  it('counts a card the reader acts on and moves the daily ring', async () => {
    const { user } = await open();
    const id = await goTo(user, 'ced');

    await user.click(action('Viac takého'));

    await waitFor(() => {
      expect(action('Viac takého')).toHaveAttribute('aria-pressed', 'true');
    });
    expect(await screen.findByRole('img', { name: 'Dnes 1 z 20 kariet' })).toBeInTheDocument();
    expect(await xpFloat('+5 XP')).toBeInTheDocument();
    expect((await db.cardState.get(id))?.liked).toBe(true);
  });

  it('keeps and releases a bookmark', async () => {
    const { user } = await open();
    const id = cardId();

    await user.click(action('Uložiť'));
    await waitFor(() => {
      expect(action('Uložiť')).toHaveAttribute('aria-pressed', 'true');
    });
    expect((await db.cardState.get(id))?.bookmarked).toBe(true);

    await user.click(action('Uložiť'));
    await waitFor(() => {
      expect(action('Uložiť')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('shows the simpler wording of a concept after "Nerozumiem"', async () => {
    const { user } = await open();
    const id = await goTo(user, 'c');
    expect(screen.queryByText(`Jednoduchšie povedané: ${id}.`)).not.toBeInTheDocument();

    await user.click(action('Nerozumiem'));

    expect(await screen.findByText(`Jednoduchšie povedané: ${id}.`)).toBeInTheDocument();
    expect(screen.getByText('Karta sa o chvíľu vráti.')).toBeInTheDocument();
    expect(action('Nerozumiem')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(async () => {
      expect((await today())?.cardsSeen).toBe(1);
    });
  });

  it('moves on after "Už viem"', async () => {
    const { user } = await open();
    const id = await goTo(user, 'ced');
    const page = feedSession.useStore.getState().pageIndex;

    await user.click(action('Už viem'));

    await waitFor(() => {
      expect(feedSession.useStore.getState().pageIndex).toBe(page + 1);
    });
    await waitFor(async () => {
      expect((await db.cardState.get(id))?.known).toBe(true);
    });
    await waitFor(async () => {
      expect((await today())?.cardsSeen).toBe(1);
    });
  });
});

describe('answering', () => {
  it('shows the right option and the explanation after a quiz answer', async () => {
    const { user } = await open();
    await goTo(user, 'q');
    const options = within(card()).getAllByRole('listitem');
    expect(options).toHaveLength(3);

    await user.click(within(card()).getByRole('button', { name: 'Nesprávna' }));

    const verdict = await within(card()).findByRole('status');
    expect(verdict).toHaveTextContent('Nesprávne');
    expect(verdict).toHaveTextContent('Správna je prvá možnosť.');
    for (const option of options) expect(within(option).getByRole('button')).toBeDisabled();
    expect(within(card()).getByRole('button', { name: 'Nesprávna' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // 2 XP for a wrong answer and 5 for a new card.
    expect(await xpFloat('+7 XP')).toBeInTheDocument();
    await waitFor(async () => {
      expect(await today()).toMatchObject({ answers: 1, correct: 0, cardsSeen: 1 });
    });
  });

  it('judges a myth', async () => {
    const { user } = await open();
    await goTo(user, 'm');
    expect(within(card()).getByText('Pravda, alebo mýtus?')).toBeInTheDocument();

    await user.click(within(card()).getByRole('button', { name: 'Mýtus' }));

    const verdict = await within(card()).findByRole('status');
    expect(verdict).toHaveTextContent('Správne · Je to mýtus.');
    expect(verdict).toHaveTextContent('V skutočnosti je to inak.');
    expect(await xpFloat('+15 XP')).toBeInTheDocument();
  });
});

describe('"Chyba"', () => {
  it('flags the card with a note, shows the note again, and takes the flag back', async () => {
    const { user } = await open();
    const id = cardId();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(action('Chyba'));
    const dialog = within(await screen.findByRole('dialog', { name: 'Nahlásiť chybu' }));
    await user.type(dialog.getByRole('textbox', { name: /Čo nesedí/ }), 'Preklep v nadpise');
    await user.click(dialog.getByRole('button', { name: 'Nahlásiť' }));

    await waitFor(async () => {
      expect((await db.cardState.get(id))?.flagged?.note).toBe('Preklep v nadpise');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(action('Chyba')).toHaveAttribute('aria-pressed', 'true');
    });

    await user.click(action('Chyba'));
    const again = within(await screen.findByRole('dialog', { name: 'Nahlásiť chybu' }));
    expect(again.getByRole('textbox', { name: /Čo nesedí/ })).toHaveValue('Preklep v nadpise');
    await user.click(again.getByRole('button', { name: 'Zrušiť nahlásenie' }));

    await waitFor(async () => {
      expect((await db.cardState.get(id))?.flagged).toBeNull();
    });
    await waitFor(() => {
      expect(action('Chyba')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('changes nothing when the sheet is cancelled', async () => {
    const { user } = await open();
    const id = cardId();

    await user.click(action('Chyba'));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByRole('textbox'), 'Omyl');
    await user.click(dialog.getByRole('button', { name: 'Zrušiť' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await db.cardState.get(id))?.flagged ?? null).toBeNull();
    expect(action('Chyba')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('the checkpoint', () => {
  /** Swipes through the first ten cards and likes the first two of them on the way. */
  async function reachCheckpoint(user: UserEvent): Promise<string[]> {
    const liked: string[] = [];
    for (let step = 0; step < 10; step += 1) {
      await screen.findByRole('article');
      if (step < 2) {
        liked.push(cardId());
        await user.click(action('Viac takého'));
        await waitFor(async () => {
          expect((await today())?.cardsSeen).toBe(step + 1);
        });
      }
      await swipe(user);
    }
    await screen.findByRole('heading', { level: 2, name: 'Desať kariet je za tebou.' });
    return liked;
  }

  /** Waits for a figure to show the value. The figures of the day come from a live query. */
  async function expectFigure(label: string, value: string): Promise<void> {
    await waitFor(() => {
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
    });
  }

  it('follows the tenth card with what the stretch brought', async () => {
    const { user } = await open();
    const liked = await reachCheckpoint(user);

    expect(screen.getByText('Zastávka 1')).toBeInTheDocument();
    await expectFigure('Skúsenosti', '+10 XP');
    await expectFigure('Nové karty', '2');
    await expectFigure('Dnes', '2 z 20');
    // No question was answered, so there is no accuracy to report.
    expect(screen.queryByText('Správne odpovede')).not.toBeInTheDocument();
    const learned = within(
      screen.getByRole('heading', { level: 3, name: 'V tejto desiatke pribudlo' }).parentElement!,
    );
    expect(learned.getAllByRole('listitem').map((item) => item.textContent)).toEqual(liked);
  });

  it('goes on to the next card with "Pokračovať"', async () => {
    const { user } = await open();
    await reachCheckpoint(user);

    await user.click(screen.getByRole('button', { name: 'Pokračovať' }));

    expect(await screen.findByRole('article')).toBeInTheDocument();
    expect(feedSession.useStore.getState().pageIndex).toBe(11);
  });

  it('closes the day with "Na dnes stačí", and the feed keeps its place', async () => {
    const { router, user } = await open();
    await reachCheckpoint(user);

    await user.click(screen.getByRole('button', { name: 'Na dnes stačí' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Na dnes stačí.' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/dnes');
    await expectFigure('Karty', '2');
    await expectFigure('Z toho nové', '10');
    await expectFigure('Skúsenosti', '+10 XP');
    // Every card seen today comes up for its first review tomorrow.
    expect(await screen.findByText('Zajtra čaká 10 opakovaní.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Späť do feedu' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Desať kariet je za tebou.' }),
    ).toBeInTheDocument();
  });
});

describe('a new level', () => {
  it('is celebrated until the reader taps anywhere', async () => {
    // Level 2 starts at 60 XP.
    await db.character.update('me', { totalXp: 58 });
    const { user } = await open();

    await user.click(action('Viac takého'));

    const celebration = await screen.findByText('Nová úroveň');
    expect(screen.getByText('Úroveň 2')).toBeInTheDocument();

    await user.click(celebration);

    expect(screen.queryByText('Nová úroveň')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Úroveň 2')).toHaveTextContent('2');
  });
});

describe('due reviews', () => {
  it('shows how many are due and opens a review session', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const id of ['robotika.zaklady.d1', 'robotika.zaklady.c2', 'robotika.zaklady.q3']) {
      await recordSeen(db, id, yesterday);
    }
    const { router, user } = await open();

    await user.click(await screen.findByRole('link', { name: 'Opakovania: 3' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Opakovanie' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/opakovanie');
  });

  it('marks a due card in the feed as a review', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await recordSeen(db, 'robotika.zaklady.q3', yesterday);
    const { user } = await open();

    const at = feedSession.useStore.getState().entries.findIndex((entry) => entry.source === 'due');
    expect(at).toBeGreaterThanOrEqual(0);
    for (let step = 0; step < at; step += 1) await swipe(user);

    await waitFor(() => {
      expect(cardId()).toBe('robotika.zaklady.q3');
    });
    expect(within(card()).getByText('Opakovanie')).toBeInTheDocument();
    expect(
      actions()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(QUESTION_ACTIONS);
  });
});

describe('the end of the feed', () => {
  it('says so when the content has run out, and leads to the summary of the day', async () => {
    await resetDb();
    await seedContent(new Date(), [packOf({ packId: 'robotika', topics: { zaklady: 'E D' } })]);
    await seedProfile({ categoryWeights: { robotika: 50 } });
    feedSession.reset();
    const { router, user } = await open();

    await swipe(user);
    await swipe(user);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'To je nateraz všetko.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vo vybraných kategóriách už nie sú nové karty a nič nečaká na opakovanie.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pozrieť dnešok' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Na dnes stačí.' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/dnes');
  });

  it('names the daily cap when that is what ended it', async () => {
    await db.settings.update('me', { newCardCap: 2 });
    const { user } = await open();

    await swipe(user);
    await swipe(user);

    expect(
      await screen.findByText(
        'Dnešná dávka nových kariet je vyčerpaná a nič nečaká na opakovanie.',
      ),
    ).toBeInTheDocument();
  });
});
