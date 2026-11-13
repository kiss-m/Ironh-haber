import { act, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { learningDay } from '../../core/day.ts';
import { GRADE } from '../../core/srs.ts';
import { seededRng } from '../../core/testing.ts';
import { db } from '../../data/db.ts';
import { recordSeen } from '../../data/progress.ts';
import { smallPacks } from '../../test/packs.ts';
import { renderApp } from '../../test/renderApp.tsx';
import { resetDb, seedContent, seedProfile } from '../../test/seed.ts';
import { feedSession, reviewSession } from '../feed/session.ts';

const QUIZ = 'fyzika-mechanika.pohyb.q2';
const FLASHCARD = 'robotika.zaklady.d1';

/** Cards seen a day ago are due now, whatever the time of day. */
async function makeDue(cardIds: readonly string[]): Promise<void> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const cardId of cardIds) await recordSeen(db, cardId, yesterday);
}

function card(): HTMLElement {
  return screen.getByRole('article');
}

async function swipe(user: UserEvent): Promise<void> {
  const before = reviewSession.useStore.getState().pageIndex;
  screen.getByRole('feed', { name: 'Karty na opakovanie' }).focus();
  await user.keyboard('{ArrowDown}');
  await waitFor(() => {
    expect(reviewSession.useStore.getState().pageIndex).toBe(before + 1);
  });
}

async function expectFigure(label: string, value: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
  });
}

const today = () => db.daily.get(learningDay(new Date()));

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

describe('review session', () => {
  it('says so when nothing is due, and leads back to the feed', async () => {
    const { router, user } = await renderApp('/opakovanie');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Nič nečaká na opakovanie.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Karty sa vrátia, keď príde ich čas.')).toBeInTheDocument();
    // It stands alone, without the tab bar.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Späť do feedu' }));

    expect(router.state.location.pathname).toBe('/');
  });

  it('asks a card with a quiz as a quiz and grades the answer', async () => {
    await makeDue([QUIZ, FLASHCARD]);
    const { user } = await renderApp('/opakovanie');

    // The quiz comes first: both are equally overdue, and ties go by id.
    await waitFor(() => {
      expect(card()).toHaveAccessibleName(QUIZ);
    });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(within(card()).getByText('Opakovanie')).toBeInTheDocument();

    await user.click(within(card()).getByRole('button', { name: 'Správna' }));

    expect(await within(card()).findByRole('status')).toHaveTextContent('Správne');
    await waitFor(async () => {
      expect(await db.reviewLog.toArray()).toEqual([
        expect.objectContaining({ cardId: QUIZ, rating: GRADE.good, mode: 'review' }),
      ]);
    });
    // A quiz card has nothing more to show than its question.
    expect(screen.queryByRole('button', { name: 'Celá karta' })).not.toBeInTheDocument();
  });

  it('asks a card without a quiz as a flashcard the reader grades', async () => {
    await makeDue([FLASHCARD]);
    const { user } = await renderApp('/opakovanie');

    await waitFor(() => {
      expect(card()).toHaveAccessibleName(FLASHCARD);
    });
    expect(within(card()).getByText(`Čo hovorí karta ${FLASHCARD}?`)).toBeInTheDocument();
    expect(within(card()).queryByText('To, čo je na nej napísané.')).not.toBeInTheDocument();

    await user.click(within(card()).getByRole('button', { name: 'Ukázať odpoveď' }));
    expect(within(card()).getByRole('status')).toHaveTextContent('To, čo je na nej napísané.');
    await user.click(within(card()).getByRole('button', { name: 'Ťažké' }));

    await waitFor(async () => {
      expect(await db.reviewLog.toArray()).toEqual([
        expect.objectContaining({ cardId: FLASHCARD, rating: GRADE.hard, mode: 'review' }),
      ]);
    });
    expect(within(card()).getByRole('button', { name: 'Ťažké' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(card()).getByRole('button', { name: 'Vedel' })).toBeDisabled();

    // After the grade, the whole card is one tap away.
    const toggle = within(card()).getByRole('button', { name: 'Celá karta' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(within(card()).getByText(new RegExp(`^Zaujímavosť ${FLASHCARD}\\.`))).toBeVisible();
    expect(within(card()).getByRole('button', { name: 'Skryť kartu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('closes the set with a summary and returns to the feed', async () => {
    await makeDue([QUIZ, FLASHCARD]);
    const { router, user } = await renderApp('/opakovanie');
    await waitFor(() => {
      expect(card()).toHaveAccessibleName(QUIZ);
    });

    await user.click(within(card()).getByRole('button', { name: 'Nesprávna' }));
    await within(card()).findByRole('status');
    await swipe(user);
    await user.click(await within(card()).findByRole('button', { name: 'Ukázať odpoveď' }));
    await user.click(within(card()).getByRole('button', { name: 'Vedel' }));
    await waitFor(async () => {
      expect((await today())?.answers).toBe(2);
    });
    await swipe(user);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sada je hotová.' }),
    ).toBeInTheDocument();
    await expectFigure('Zopakované karty', '2');
    await expectFigure('Správne odpovede', '1 z 2');
    // 2 XP for the miss and 10 for the card the reader knew.
    await expectFigure('Skúsenosti', '+12 XP');
    expect(screen.queryByRole('button', { name: 'Ďalšia sada' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Späť do feedu' }));

    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByRole('feed', { name: 'Feed kariet' })).toBeInTheDocument();
  });

  it('offers another set while more cards are due', async () => {
    const all = smallPacks().flatMap((pack) => pack.cards.map((item) => item.id));
    await makeDue(all);
    const { user } = await renderApp('/opakovanie');
    await screen.findByText('1 / 20');
    const first = (await screen.findByRole('article')).getAttribute('aria-label');

    // Jump to the closing page. Nothing was answered, so all 36 cards are still due.
    act(() => {
      reviewSession.setPage(20);
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sada je hotová.' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Čaká ešte 36 kariet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ďalšia sada' }));

    expect(await screen.findByText('1 / 20')).toBeInTheDocument();
    await waitFor(() => {
      expect(card()).toHaveAccessibleName(first ?? '');
    });
  });

  it('can be left at any time with the close button', async () => {
    await makeDue([QUIZ]);
    const { router, user } = await renderApp('/opakovanie');
    await screen.findByRole('article');

    await user.click(screen.getByRole('link', { name: 'Zavrieť opakovanie' }));

    expect(router.state.location.pathname).toBe('/');
  });

  it('starts from what is due now every time it is opened', async () => {
    await makeDue([QUIZ, FLASHCARD]);
    const { router, user } = await renderApp('/opakovanie');
    await waitFor(() => {
      expect(card()).toHaveAccessibleName(QUIZ);
    });
    await user.click(within(card()).getByRole('button', { name: 'Správna' }));
    await waitFor(async () => {
      expect((await today())?.answers).toBe(1);
    });
    await user.click(screen.getByRole('link', { name: 'Zavrieť opakovanie' }));
    await screen.findByRole('feed', { name: 'Feed kariet' });

    await act(() => router.navigate('/opakovanie'));

    // The answered quiz is no longer due, so the new session holds the flashcard alone.
    expect(await screen.findByText('1 / 1')).toBeInTheDocument();
    await waitFor(() => {
      expect(card()).toHaveAccessibleName(FLASHCARD);
    });
  });
});
