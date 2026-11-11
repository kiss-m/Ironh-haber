import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRADE } from '../../core/srs.ts';
import { db } from '../../data/db.ts';
import { addActiveSeconds, recordAnswer, recordRead, recordSeen } from '../../data/progress.ts';
import { smallPacks } from '../../test/packs.ts';
import { renderApp } from '../../test/renderApp.tsx';
import { resetDb, seedContent, seedProfile } from '../../test/seed.ts';
import { feedSession } from './session.ts';

const A = 'robotika.zaklady.d1';
const B = 'robotika.zaklady.c2';
const QUIZ = 'robotika.zaklady.q3';

function figure(label: string): Element | null {
  return screen.getByText(label).nextElementSibling;
}

/** Two cards read and two and a half minutes spent, all of it right now. */
async function readTwoCards(): Promise<void> {
  const now = new Date();
  for (const cardId of [A, B]) {
    await recordSeen(db, cardId, now);
    await recordRead(db, cardId, now, { newCard: true });
  }
  await addActiveSeconds(db, 150, now);
}

beforeEach(async () => {
  await resetDb();
  await seedContent(new Date(), smallPacks());
  await seedProfile();
  feedSession.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the summary of the day', () => {
  it('shows what today brought and what waits tomorrow', async () => {
    await readTwoCards();
    await renderApp('/dnes');

    expect(screen.getByRole('heading', { level: 1, name: 'Na dnes stačí.' })).toBeVisible();
    await waitFor(() => {
      expect(figure('Karty')).toHaveTextContent('2');
    });
    expect(figure('Z toho nové')).toHaveTextContent('2');
    expect(figure('Skúsenosti')).toHaveTextContent('+10 XP');
    expect(figure('Minúty namiesto scrollovania')).toHaveTextContent('3');
    // Nothing was answered, so there is no accuracy to report.
    expect(screen.queryByText('Správne odpovede')).not.toBeInTheDocument();
    expect(await screen.findByText('Zajtra čakajú 2 opakovania.')).toBeInTheDocument();
    // It stands alone, without the tab bar.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('reports the accuracy once something was answered', async () => {
    const now = new Date();
    await recordSeen(db, QUIZ, now);
    await recordAnswer(
      db,
      {
        cardId: QUIZ,
        correct: true,
        responseMs: 2_000,
        grade: null,
        mode: 'feed',
        countCard: true,
        newCard: true,
      },
      now,
    );
    await renderApp('/dnes');

    await waitFor(() => {
      expect(figure('Správne odpovede')).toHaveTextContent('1 z 1');
    });
    expect(await screen.findByText('Zajtra čaká 1 opakovanie.')).toBeInTheDocument();
  });

  it('stays calm on a day without any cards', async () => {
    await renderApp('/dnes');

    expect(figure('Karty')).toHaveTextContent('0');
    expect(figure('Skúsenosti')).toHaveTextContent('+0 XP');
    expect(await screen.findByText('Zajtra nečaká žiadne opakovanie.')).toBeInTheDocument();
  });

  it('counts a card that was rated today and comes back tomorrow', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await recordSeen(db, QUIZ, yesterday);
    await recordAnswer(
      db,
      {
        cardId: QUIZ,
        correct: false,
        responseMs: 2_000,
        grade: GRADE.again,
        mode: 'review',
        countCard: true,
        newCard: false,
      },
      new Date(),
    );
    await renderApp('/dnes');

    expect(await screen.findByText('Zajtra čaká 1 opakovanie.')).toBeInTheDocument();
  });

  it('leads back to the feed', async () => {
    const { router, user } = await renderApp('/dnes');

    await user.click(screen.getByRole('button', { name: 'Späť do feedu' }));

    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByRole('feed', { name: 'Feed kariet' })).toBeInTheDocument();
  });

  it('makes way for the feed when the app is opened again on a new day', async () => {
    // Only the clock is faked. Timers stay real, so the queries of the screen still settle.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T18:00:00Z') });
    await readTwoCards();
    const { router } = await renderApp('/dnes');
    await waitFor(() => {
      expect(figure('Karty')).toHaveTextContent('2');
    });

    vi.setSystemTime(new Date('2026-11-11T06:00:00Z'));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    // Yesterday's two cards are due, and the new day starts from zero.
    expect(await screen.findByRole('link', { name: 'Opakovania: 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dnes 0 z 20 kariet' })).toBeInTheDocument();
  });
});
