import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEXT_BATCH_LOOKAHEAD, REQUEUE_MIN_GAP, REVIEW_SESSION_SIZE } from '../../core/config.ts';
import { GRADE } from '../../core/srs.ts';
import { seededRng } from '../../core/testing.ts';
import { db } from '../../data/db.ts';
import { updateSettings } from '../../data/profile.ts';
import { recordAnswer, recordSeen } from '../../data/progress.ts';
import type { EventType } from '../../data/types.ts';
import { kindOf, packOf, smallPacks } from '../../test/packs.ts';
import { resetDb, seedContent, seedProfile } from '../../test/seed.ts';
import { createSession, type Session, type SessionKind } from './session.ts';

// The clock of the session is faked, the database still works on real macrotasks.
const realSetTimeout = globalThis.setTimeout;

const DAY_1 = new Date('2026-11-10T18:00:00Z'); // 19:00 in Prague, learning day 10 November
const DAY_2 = new Date('2026-11-11T18:00:00Z');
const TODAY = '2026-11-10';
const TOMORROW = '2026-11-11';
const TOMORROW_START = Date.parse('2026-11-11T03:00:00Z'); // 04:00 in Prague

/** Long enough not to count as skipped, too short to count as read. */
const GLANCE_MS = 2_500;

function tick(): Promise<void> {
  return new Promise((resolve) => {
    realSetTimeout(resolve, 0);
  });
}

/** Waits for work the session started without anyone awaiting it. */
async function until(check: () => boolean | Promise<boolean>, what: string): Promise<void> {
  for (let round = 0; round < 2_000; round += 1) {
    if (await check()) return;
    await tick();
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

/** Lets pending database work finish. Used before asserting that something did not happen. */
async function idle(): Promise<void> {
  for (let round = 0; round < 40; round += 1) await tick();
}

function setVisibility(value: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
  document.dispatchEvent(new Event('visibilitychange'));
}

const sessions: Session[] = [];

const state = (session: Session) => session.useStore.getState();
const queue = (session: Session) => state(session).entries;
const today = () => db.daily.get(TODAY);
const events = (type: EventType) => db.events.where('type').equals(type).toArray();
const topicOf = (cardId: string) => cardId.slice(0, cardId.lastIndexOf('.'));

function currentPage(session: Session) {
  return session.pages(state(session))[state(session).pageIndex];
}

/** Waits until the card on screen has been recorded as seen. */
async function shown(session: Session): Promise<void> {
  const page = currentPage(session);
  if (page?.kind !== 'card') return;
  const { cardId } = page.entry;
  await until(async () => (await db.cardState.get(cardId)) !== undefined, `${cardId} to be seen`);
}

async function start(kind: SessionKind = 'feed'): Promise<Session> {
  const session = createSession(kind);
  sessions.push(session);
  session.attach();
  await until(() => state(session).status === 'ready', 'the session to be ready');
  await shown(session);
  return session;
}

/** Moves to the next page after `ms` on the current one. */
async function swipe(session: Session, ms = GLANCE_MS): Promise<void> {
  vi.advanceTimersByTime(ms);
  session.setPage(state(session).pageIndex + 1);
  await shown(session);
}

/** Swipes forward, with a glance at every card on the way, until the entry is on screen. */
async function walkTo(session: Session, entryIndex: number): Promise<void> {
  for (let step = 0; step < 100; step += 1) {
    const page = currentPage(session);
    if (page?.kind === 'card' && page.entryIndex === entryIndex) return;
    await swipe(session);
  }
  throw new Error(`Entry ${entryIndex} was never reached.`);
}

/** Walks close enough to the end of the queue for the next batch to be built. */
async function reachNextBatch(session: Session): Promise<void> {
  const before = queue(session).length;
  await walkTo(session, before - 1 - NEXT_BATCH_LOOKAHEAD);
  await until(
    () => queue(session).length > before || state(session).exhausted,
    'the next batch to be built',
  );
}

/** The first new card in the queue whose kind is one of the given letters (see test/packs.ts). */
function find(session: Session, kinds: string): number {
  const index = queue(session).findIndex(
    (entry) => entry.source === 'new' && kinds.includes(kindOf(entry.cardId)),
  );
  if (index === -1) {
    const listing = queue(session)
      .map((entry) => entry.cardId)
      .join(', ');
    throw new Error(`No new card of kind "${kinds}" in the queue: ${listing}`);
  }
  return index;
}

/** Answers the question of an entry correctly: "Mýtus" for a myth, the first option otherwise. */
function answerRight(session: Session, entryIndex: number): Promise<void> {
  const { cardId } = queue(session)[entryIndex]!;
  return kindOf(cardId) === 'm'
    ? session.answerMyth(entryIndex, false)
    : session.answerQuiz(entryIndex, 0);
}

/** The reader saw these cards on day 1, so they are due on day 2. */
async function seeOnDayOne(cardIds: readonly string[]): Promise<void> {
  for (const cardId of cardIds) await recordSeen(db, cardId, DAY_1);
}

const ALL_CARDS = smallPacks().flatMap((pack) => pack.cards.map((card) => card.id));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: DAY_1 });
  vi.spyOn(Math, 'random').mockImplementation(seededRng(7));
  await resetDb();
  await seedContent(DAY_1, smallPacks());
  await seedProfile({}, DAY_1);
});

afterEach(async () => {
  for (const session of sessions.splice(0)) session.detach();
  await idle();
  Reflect.deleteProperty(document, 'visibilityState');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('starting', () => {
  it('builds a batch of ten new cards and shows the first one', async () => {
    const feed = await start();

    const { entries, exhausted, pageIndex } = state(feed);
    expect(entries).toHaveLength(10);
    expect(entries.every((entry) => entry.source === 'new')).toBe(true);
    expect(new Set(entries.map((entry) => entry.cardId)).size).toBe(10);
    expect(exhausted).toBe(false);
    expect(pageIndex).toBe(0);
    // Ten cards and the checkpoint that closes them.
    expect(feed.pages(state(feed)).map((page) => page.kind)).toEqual([
      ...Array.from({ length: 10 }, () => 'card'),
      'checkpoint',
    ]);
  });

  it('records the first card as seen: a new card with a schedule, not yet read', async () => {
    const feed = await start();
    const { cardId } = queue(feed)[0]!;

    expect(await db.cardState.get(cardId)).toMatchObject({
      seenCount: 1,
      srs: { reps: 0, due: TOMORROW_START },
    });
    expect(await today()).toMatchObject({ newCards: 1, cardsSeen: 0, xp: 0 });
    expect(state(feed).stats).toEqual([]);
  });

  it('ignores a reset that arrives while the first batch is being built', async () => {
    const feed = createSession('feed');
    sessions.push(feed);
    feed.attach();
    feed.reset();
    await until(() => state(feed).status === 'ready', 'the session to be ready');
    await idle();

    const ids = queue(feed).map((entry) => entry.cardId);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });
});

describe('a reset', () => {
  it('keeps a reading that was still being recorded out of the new session', async () => {
    const feed = await start();

    // The three seconds are up and the reading is on its way to the database when the
    // session is reset.
    vi.advanceTimersByTime(3_000);
    feed.reset();
    await until(() => state(feed).status === 'ready', 'the new session');
    await until(async () => (await today())?.cardsSeen === 1, 'the reading to be stored');
    await idle();

    // The day has the card. The figures of the new session start empty.
    expect(state(feed)).toMatchObject({ pageIndex: 0, stats: [], reward: null });
  });

  it('does not pass an action meant for the old session on to a card of the new one', async () => {
    // Readings only, so that whichever card opens the new queue can count as skipped.
    await resetDb();
    await seedContent(DAY_1, [
      packOf({ packId: 'fyzika-mechanika', topics: { pohyb: 'E D E D E D' } }),
      packOf({ packId: 'robotika', topics: { zaklady: 'D E D E D E' } }),
    ]);
    await seedProfile({ categoryWeights: { 'fyzika-mechanika': 50, robotika: 50 } }, DAY_1);
    const feed = await start();
    const liked = queue(feed)[0]!.cardId;

    const liking = feed.like(0, true);
    feed.reset();
    await liking;
    await until(() => state(feed).status === 'ready', 'the new session');
    await shown(feed);
    const first = queue(feed)[0]!.cardId;

    // The like itself is kept. It just says nothing about entry 0 of the new queue:
    expect((await db.cardState.get(liked))?.liked).toBe(true);
    expect(first).not.toBe(liked);
    expect((await today())?.cardsSeen).toBe(0);
    expect(state(feed).stats).toEqual([]);

    // that card was not acted on, so leaving it at once still counts as a skip.
    await swipe(feed, 500);
    await until(async () => (await events('quick_skip')).length === 1, 'the skip to be noted');
    expect((await events('quick_skip'))[0]?.cardId).toBe(first);
  });

  it('drops an answer that was given at the very moment of the reset', async () => {
    const feed = await start();
    const index = find(feed, 'q');
    await walkTo(feed, index);

    const answering = feed.answerQuiz(index, 0);
    feed.reset();
    await answering;
    await until(() => state(feed).status === 'ready', 'the new session');
    await idle();

    expect(state(feed).pages).toEqual({});
    expect((await today())?.answers).toBe(0);
  });
});

describe('reading a card', () => {
  it('counts it as read after three seconds on screen', async () => {
    const feed = await start();
    const { cardId } = queue(feed)[0]!;

    vi.advanceTimersByTime(2_999);
    await idle();
    expect((await today())?.cardsSeen).toBe(0);

    vi.advanceTimersByTime(1);
    await until(() => state(feed).stats[0]?.newTitles.length === 1, 'the card to count');

    expect(await today()).toMatchObject({ cardsSeen: 1, newCards: 1, xp: 5 });
    expect(state(feed).stats).toEqual([
      { cards: 1, xp: 5, answers: 0, correct: 0, newTitles: [cardId], goalReached: false },
    ]);
    expect(state(feed).reward).toEqual({ id: 1, xp: 5 });
    expect(await events('card_read')).toHaveLength(1);
  });

  it('counts it at once when the reader acts on it, and only once', async () => {
    const feed = await start();
    const { cardId } = queue(feed)[0]!;

    vi.advanceTimersByTime(500);
    await feed.like(0, true);

    expect((await db.cardState.get(cardId))?.liked).toBe(true);
    expect(await today()).toMatchObject({ cardsSeen: 1, xp: 5 });

    // The three seconds that follow do not count the card a second time.
    vi.advanceTimersByTime(5_000);
    await idle();
    expect(await today()).toMatchObject({ cardsSeen: 1, xp: 5 });
  });

  it('stops the three seconds while the app is in the background', async () => {
    const feed = await start();

    vi.advanceTimersByTime(2_000);
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);
    setVisibility('visible');
    vi.advanceTimersByTime(999);
    await idle();
    expect((await today())?.cardsSeen).toBe(0);

    vi.advanceTimersByTime(1);
    await until(async () => (await today())?.cardsSeen === 1, 'the card to count');

    // Only the three visible seconds are learning time.
    await swipe(feed, 0);
    await until(async () => (await today())?.activeSeconds === 3, 'the time to be booked');
  });

  it('stops the three seconds while the reader is on another screen', async () => {
    const feed = await start();

    vi.advanceTimersByTime(2_000);
    feed.detach();
    vi.advanceTimersByTime(60_000);
    await idle();
    expect(await today()).toMatchObject({ cardsSeen: 0, activeSeconds: 2 });

    feed.attach();
    vi.advanceTimersByTime(1_000);
    await until(async () => (await today())?.cardsSeen === 1, 'the card to count');
  });

  it('books at most ninety seconds of learning time for one card', async () => {
    const feed = await start();

    await swipe(feed, 200_000);

    await until(async () => (await today())?.activeSeconds === 90, 'the time to be booked');
  });
});

describe('leaving a card', () => {
  it('takes a reading left within two seconds as a sign of less interest', async () => {
    const feed = await start();
    const index = find(feed, 'ced');
    await walkTo(feed, index);

    await swipe(feed, 1_999);
    await until(async () => (await events('quick_skip')).length === 1, 'the skip to be noted');

    const { cardId } = queue(feed)[index]!;
    expect((await events('quick_skip'))[0]?.cardId).toBe(cardId);
    expect((await db.topicAffinity.get(topicOf(cardId)))?.affinity).toBeCloseTo(0.97);
    expect((await today())?.cardsSeen).toBe(0);
  });

  it('neither counts nor skips a card that got a two-second glance', async () => {
    const feed = await start();
    const index = find(feed, 'ced');
    await walkTo(feed, index);
    const pageIndex = state(feed).pageIndex;

    await swipe(feed, 2_000);
    await idle();
    expect(await events('quick_skip')).toHaveLength(0);
    expect((await today())?.cardsSeen).toBe(0);

    // Back on the card, it needs only the rest of its three seconds.
    feed.setPage(pageIndex);
    vi.advanceTimersByTime(999);
    await idle();
    expect((await today())?.cardsSeen).toBe(0);
    vi.advanceTimersByTime(1);
    await until(async () => (await today())?.cardsSeen === 1, 'the card to count');
  });

  it.each([
    ['quiz', 'q'],
    ['myth', 'm'],
  ])('does not take an unanswered %s for a skipped card', async (_name, kind) => {
    const feed = await start();
    await walkTo(feed, find(feed, kind));

    await swipe(feed, 300);
    await idle();

    expect(await events('quick_skip')).toHaveLength(0);
    expect(await db.topicAffinity.count()).toBe(0);
  });

  it('does not take a card for skipped after the reader acted on it', async () => {
    const feed = await start();
    const index = find(feed, 'ced');
    await walkTo(feed, index);

    await feed.bookmark(index, true);
    await swipe(feed, 300);
    await idle();

    expect(await events('quick_skip')).toHaveLength(0);
    // The bookmark raised the affinity. Nothing lowered it again.
    const { cardId } = queue(feed)[index]!;
    expect((await db.topicAffinity.get(topicOf(cardId)))?.affinity).toBeCloseTo(1.1);
  });
});

describe('a question on its first showing', () => {
  it('earns XP and counts as a card, but is not a review', async () => {
    const feed = await start();
    const index = find(feed, 'q');
    await walkTo(feed, index);
    const { cardId } = queue(feed)[index]!;

    vi.advanceTimersByTime(1_500);
    await feed.answerQuiz(index, 0);

    expect(state(feed).pages[index]).toMatchObject({ choice: 0, correct: true });
    // 10 for the right answer and 5 for a new card.
    expect(await today()).toMatchObject({ answers: 1, correct: 1, cardsSeen: 1, xp: 15 });
    expect(state(feed).stats[0]).toMatchObject({
      cards: 1,
      xp: 15,
      answers: 1,
      correct: 1,
      newTitles: [cardId],
    });
    expect(await db.reviewLog.count()).toBe(0);
    expect(await db.cardState.get(cardId)).toMatchObject({
      srs: { reps: 0, due: TOMORROW_START },
      lastAnsweredAt: Date.now(),
    });
  });

  it('takes only the first answer', async () => {
    const feed = await start();
    const index = find(feed, 'q');
    await walkTo(feed, index);

    // A double tap: the second answer arrives before the first one is stored.
    const first = feed.answerQuiz(index, 1);
    await feed.answerQuiz(index, 0);
    await first;
    await feed.answerQuiz(index, 0);

    expect(state(feed).pages[index]).toMatchObject({ choice: 1, correct: false });
    // 2 for the wrong answer and 5 for a new card.
    expect(await today()).toMatchObject({ answers: 1, correct: 0, xp: 7 });
  });

  it('lets the reader judge a myth', async () => {
    const feed = await start();
    const index = find(feed, 'm');
    await walkTo(feed, index);

    // The statement is false, so "Mýtus" is the right verdict.
    await feed.answerMyth(index, false);
    await feed.answerMyth(index, true);

    expect(state(feed).pages[index]).toMatchObject({ verdict: false, correct: true });
    expect(await today()).toMatchObject({ answers: 1, correct: 1, xp: 15 });
    expect(await db.reviewLog.count()).toBe(0);
  });

  it('does not count a question twice that was read first and answered later', async () => {
    const feed = await start();
    const index = find(feed, 'q');
    await walkTo(feed, index);

    vi.advanceTimersByTime(3_000);
    await until(async () => (await today())?.cardsSeen === 1, 'the reading to count');
    await feed.answerQuiz(index, 0);

    // 5 for reading the new card, then 10 for the answer: no second 5.
    expect(await today()).toMatchObject({ cardsSeen: 1, answers: 1, xp: 15 });
    expect(state(feed).stats[0]).toMatchObject({ cards: 1, xp: 15 });
  });
});

describe('the actions under a card', () => {
  it('"Uložiť" keeps the card and can be taken back', async () => {
    const feed = await start();
    const { cardId } = queue(feed)[0]!;

    await feed.bookmark(0, true);
    expect((await db.cardState.get(cardId))?.bookmarked).toBe(true);

    await feed.bookmark(0, false);
    expect((await db.cardState.get(cardId))?.bookmarked).toBe(false);
    expect((await db.topicAffinity.get(topicOf(cardId)))?.affinity).toBeCloseTo(1);
  });

  it('"Už viem" rates a card that was never tested as easy', async () => {
    const feed = await start();
    const index = find(feed, 'ced');
    await walkTo(feed, index);
    const { cardId } = queue(feed)[index]!;

    await feed.known(index);

    const cardState = await db.cardState.get(cardId);
    expect(cardState).toMatchObject({ known: true, srs: { reps: 1 } });
    expect(cardState!.srs!.due).toBeGreaterThan(TOMORROW_START);
    expect(await db.reviewLog.toArray()).toEqual([
      expect.objectContaining({ cardId, rating: GRADE.easy, mode: 'feed' }),
    ]);
    expect(await today()).toMatchObject({ cardsSeen: 1, xp: 5 });
  });

  it('"Chyba" stores the note, and taking the flag back is not an action', async () => {
    const feed = await start();
    const { cardId } = queue(feed)[0]!;

    await feed.flag(0, null);
    expect((await today())?.cardsSeen).toBe(0);

    await feed.flag(0, '  preklep v druhej vete ');
    expect((await db.cardState.get(cardId))?.flagged).toEqual({
      at: Date.now(),
      note: 'preklep v druhej vete',
    });
    expect((await today())?.cardsSeen).toBe(1);

    await feed.flag(0, null);
    expect((await db.cardState.get(cardId))?.flagged).toBeNull();
  });
});

describe('"Nerozumiem"', () => {
  async function notUnderstood() {
    const feed = await start();
    const index = find(feed, 'c');
    await walkTo(feed, index);
    await feed.notUnderstood(index);
    return { feed, index, cardId: queue(feed)[index]!.cardId };
  }

  function repeatsIn(session: Session) {
    return queue(session).flatMap((entry, at) =>
      entry.source === 'repeat' ? [{ cardId: entry.cardId, at }] : [],
    );
  }

  it('marks the card, notes the tap and counts the card as read', async () => {
    const { feed, index, cardId } = await notUnderstood();

    expect(state(feed).pages[index]?.notUnderstood).toBe(true);
    expect((await events('not_understood')).map((event) => event.cardId)).toEqual([cardId]);
    expect(await today()).toMatchObject({ cardsSeen: 1, xp: 5 });
  });

  it('brings the card back once, at least five cards later', async () => {
    const { feed, index, cardId } = await notUnderstood();
    await feed.notUnderstood(index);

    // If no place in the first batch fits the order rules, the repeat joins the next one.
    await reachNextBatch(feed);

    expect(await events('not_understood')).toHaveLength(1);
    const repeats = repeatsIn(feed);
    expect(repeats.map((repeat) => repeat.cardId)).toEqual([cardId]);
    expect(repeats[0]!.at).toBeGreaterThanOrEqual(index + 1 + REQUEUE_MIN_GAP);
  });

  it('counts the second reading toward the goal without paying for it again', async () => {
    const { feed, cardId } = await notUnderstood();
    await reachNextBatch(feed);
    await walkTo(feed, repeatsIn(feed)[0]!.at);
    const before = (await today())!;

    vi.advanceTimersByTime(3_000);
    await until(
      async () => (await today())?.cardsSeen === before.cardsSeen + 1,
      'the repeat to count',
    );

    expect(await today()).toMatchObject({ xp: before.xp, newCards: before.newCards });
    // The card is listed once among what the session brought.
    const titles = state(feed).stats.flatMap((stats) => stats.newTitles);
    expect(titles.filter((title) => title === cardId)).toHaveLength(1);
  });

  it('asks for an easier card of the same topic next', async () => {
    const { feed, cardId } = await notUnderstood();
    const firstBatch = new Set(queue(feed).map((entry) => entry.cardId));

    await reachNextBatch(feed);

    const added = queue(feed).filter(
      (entry) =>
        entry.source === 'new' &&
        !firstBatch.has(entry.cardId) &&
        topicOf(entry.cardId) === topicOf(cardId),
    );
    // Every topic of the test content keeps one card of difficulty 1 near its end.
    expect(added[0]?.cardId).toMatch(/\.(?:d11|e12)$/u);
    // The hint is spent on that card. The topic then goes on where it was.
    expect(added[1]?.cardId).not.toMatch(/\.(?:d11|e12)$/u);
  });
});

describe('the next batch', () => {
  it('is built when three cards are left, and repeats no card', async () => {
    const feed = await start();

    await walkTo(feed, 5);
    await idle();
    expect(queue(feed)).toHaveLength(10);

    await swipe(feed);
    await until(() => queue(feed).length > 10, 'the next batch');

    expect(queue(feed)).toHaveLength(20);
    const firstReadings = queue(feed)
      .filter((entry) => entry.source === 'new')
      .map((entry) => entry.cardId);
    expect(new Set(firstReadings).size).toBe(firstReadings.length);
    expect(feed.pages(state(feed))[10]).toEqual({ kind: 'checkpoint', batch: 1 });
  });

  it('asks about cards that were passed without an answer, but not the one on screen', async () => {
    const feed = await start();
    await reachNextBatch(feed);

    const passed = queue(feed)
      .slice(0, 6)
      .map((entry) => entry.cardId);
    const recent = queue(feed).filter((entry) => entry.source === 'recent');
    expect(recent.length).toBeGreaterThan(0);
    for (const entry of recent) {
      expect(passed).toContain(entry.cardId);
      // A quiz, a myth, or the concept that carries a quiz.
      expect(['q', 'm', 'c']).toContain(kindOf(entry.cardId));
    }
  });

  it('grades the answer to such a question as a review', async () => {
    const feed = await start();
    await reachNextBatch(feed);
    const at = queue(feed).findIndex((entry) => entry.source === 'recent');
    const { cardId } = queue(feed)[at]!;
    await walkTo(feed, at);
    const before = (await today())!;

    vi.advanceTimersByTime(4_000);
    await answerRight(feed, at);

    expect(await db.reviewLog.toArray()).toEqual([
      expect.objectContaining({ cardId, rating: GRADE.good, mode: 'feed', responseMs: 4_000 }),
    ]);
    const cardState = (await db.cardState.get(cardId))!;
    expect(cardState.srs).toMatchObject({ reps: 1 });
    expect(cardState.srs!.due).toBeGreaterThanOrEqual(TOMORROW_START);
    // It counts as a card and pays for the answer, but it is not a new card.
    expect(await today()).toMatchObject({
      cardsSeen: before.cardsSeen + 1,
      newCards: before.newCards,
      answers: before.answers + 1,
      xp: before.xp + 10,
    });
  });

  it('drops a waiting question once its card has been answered', async () => {
    const feed = await start();
    await reachNextBatch(feed);
    const waiting = queue(feed).find(
      (entry) => entry.source === 'recent' && kindOf(entry.cardId) !== 'c',
    )!;
    const first = queue(feed).findIndex(
      (entry) => entry.source === 'new' && entry.cardId === waiting.cardId,
    );
    const length = queue(feed).length;

    // The reader scrolls back and answers the card where it was first shown.
    feed.setPage(first);
    await answerRight(feed, first);

    expect(queue(feed)).toHaveLength(length - 1);
    expect(queue(feed).filter((entry) => entry.cardId === waiting.cardId)).toEqual([
      { cardId: waiting.cardId, source: 'new' },
    ]);
  });
});

describe('the end of the content', () => {
  it('closes the feed with an end page when every card has been shown', async () => {
    await resetDb();
    await seedContent(DAY_1, [packOf({ packId: 'robotika', topics: { zaklady: 'E D E' } })]);
    await seedProfile({ categoryWeights: { robotika: 50 } }, DAY_1);

    const feed = await start();
    await until(() => state(feed).exhausted, 'the feed to run out');

    expect(queue(feed).map((entry) => entry.cardId)).toEqual([
      'robotika.zaklady.e1',
      'robotika.zaklady.d2',
      'robotika.zaklady.e3',
    ]);
    expect(feed.pages(state(feed)).map((page) => page.kind)).toEqual([
      'card',
      'card',
      'card',
      'end',
    ]);
  });

  it('keeps the card on screen out of the next batch even before its showing is recorded', async () => {
    await updateSettings(db, { newCardCap: 4 });
    // In the background no card counts as shown, so nothing is recorded as seen.
    setVisibility('hidden');
    const feed = createSession('feed');
    sessions.push(feed);
    feed.attach();
    await until(() => state(feed).exhausted, 'the feed to run out');

    expect(await db.cardState.count()).toBe(0);
    const ids = queue(feed).map((entry) => entry.cardId);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('stops serving new cards at the daily cap', async () => {
    await updateSettings(db, { newCardCap: 4 });

    const feed = await start();
    await until(() => state(feed).exhausted, 'the feed to run out');

    expect(queue(feed)).toHaveLength(4);
    expect(queue(feed).every((entry) => entry.source === 'new')).toBe(true);
  });
});

describe('rewards', () => {
  it('announces a new level until it is dismissed', async () => {
    // Level 2 starts at 60 XP.
    await db.character.update('me', { totalXp: 58 });
    const feed = await start();

    vi.advanceTimersByTime(3_000);
    await until(() => state(feed).levelUp !== null, 'the new level');

    expect(state(feed).levelUp).toBe(2);
    feed.dismissLevelUp();
    expect(state(feed).levelUp).toBeNull();
  });

  it('marks the stretch in which the daily goal was reached and pays the bonus', async () => {
    await updateSettings(db, { dailyGoal: 2 });
    const feed = await start();

    vi.advanceTimersByTime(3_000);
    await until(async () => (await today())?.cardsSeen === 1, 'the first card to count');
    expect(state(feed).stats[0]?.goalReached).toBe(false);

    await swipe(feed, 0);
    vi.advanceTimersByTime(3_000);
    await until(() => state(feed).stats[0]?.goalReached === true, 'the goal to be reached');

    // 5 for the card and 50 for the goal.
    expect(state(feed).reward?.xp).toBe(55);
    expect(await today()).toMatchObject({ cardsSeen: 2, goalMet: true, xp: 60 });
  });
});

describe('a review session', () => {
  it('holds the due cards and nothing else, and ends with a closing page', async () => {
    const seen = ALL_CARDS.slice(0, 5);
    await seeOnDayOne(seen);
    vi.setSystemTime(DAY_2);

    const review = await start('review');

    expect(queue(review).map((entry) => entry.source)).toEqual(['due', 'due', 'due', 'due', 'due']);
    expect(
      queue(review)
        .map((entry) => entry.cardId)
        .sort(),
    ).toEqual([...seen].sort());
    expect(state(review).exhausted).toBe(true);
    expect(review.pages(state(review)).map((page) => page.kind)).toEqual([
      'card',
      'card',
      'card',
      'card',
      'card',
      'end',
    ]);
  });

  it('has nothing but the closing page when no card is due', async () => {
    await seeOnDayOne(ALL_CARDS.slice(0, 5));

    // Still day 1: what was seen today is due tomorrow.
    const review = await start('review');

    expect(queue(review)).toEqual([]);
    expect(review.pages(state(review))).toEqual([{ kind: 'end' }]);
  });

  it('is limited to twenty cards', async () => {
    await seeOnDayOne(ALL_CARDS);
    vi.setSystemTime(DAY_2);

    const review = await start('review');

    expect(queue(review)).toHaveLength(REVIEW_SESSION_SIZE);
  });

  it('grades a flashcard by the button the reader picks', async () => {
    const cardId = 'robotika.zaklady.d1';
    await seeOnDayOne([cardId]);
    vi.setSystemTime(DAY_2);
    const review = await start('review');

    vi.advanceTimersByTime(6_000);
    review.reveal(0);
    vi.advanceTimersByTime(2_000);
    await review.gradeFlashcard(0, 'hard');
    await review.gradeFlashcard(0, 'easy');

    expect(state(review).pages[0]).toMatchObject({ revealed: true, grade: 'hard', correct: true });
    // The response time is the time it took to ask for the answer.
    expect(await db.reviewLog.toArray()).toEqual([
      expect.objectContaining({ cardId, rating: GRADE.hard, mode: 'review', responseMs: 6_000 }),
    ]);
    expect(await db.daily.get(TOMORROW)).toMatchObject({
      answers: 1,
      correct: 1,
      cardsSeen: 1,
      newCards: 0,
      xp: 10,
    });
    expect(state(review).stats).toEqual([
      { cards: 1, xp: 10, answers: 1, correct: 1, newTitles: [], goalReached: false },
    ]);
  });

  it('takes "Nevedel" for a miss and brings the card back the next day', async () => {
    const cardId = 'robotika.zaklady.d1';
    await seeOnDayOne([cardId]);
    vi.setSystemTime(DAY_2);
    const review = await start('review');

    review.reveal(0);
    await review.gradeFlashcard(0, 'again');

    expect(state(review).pages[0]).toMatchObject({ grade: 'again', correct: false });
    expect(await db.daily.get(TOMORROW)).toMatchObject({ answers: 1, correct: 0, xp: 2 });
    expect((await db.cardState.get(cardId))?.srs).toMatchObject({
      due: Date.parse('2026-11-12T03:00:00Z'),
    });
  });

  it('keeps one set of figures, however long it is', async () => {
    await seeOnDayOne(ALL_CARDS.slice(0, 15));
    vi.setSystemTime(DAY_2);
    const review = await start('review');

    await walkTo(review, 12);
    const { cardId } = queue(review)[12]!;
    if ('qm'.includes(kindOf(cardId)) || cardId === 'robotika.zaklady.c4') {
      await answerRight(review, 12);
    } else {
      review.reveal(12);
      await review.gradeFlashcard(12, 'good');
    }

    expect(state(review).stats).toHaveLength(1);
    expect(state(review).stats[0]).toMatchObject({ cards: 1, answers: 1, correct: 1 });
  });
});

describe('the next day', () => {
  const DUE = ['ako-veci-funguju.kuchyna.q2', 'fyzika-mechanika.pohyb.q2', 'robotika.zaklady.q3'];

  it('mixes the due reviews into the first batch', async () => {
    await seeOnDayOne(DUE);
    vi.setSystemTime(DAY_2);

    const feed = await start();

    const due = queue(feed).filter((entry) => entry.source === 'due');
    expect(due.map((entry) => entry.cardId).sort()).toEqual(DUE);
    expect(queue(feed).filter((entry) => entry.source === 'new')).toHaveLength(7);
  });

  it('grades a due review, counts it toward the goal, and does not call it new', async () => {
    await seeOnDayOne(DUE);
    vi.setSystemTime(DAY_2);
    const feed = await start();
    const at = queue(feed).findIndex((entry) => entry.source === 'due');
    const { cardId } = queue(feed)[at]!;
    await walkTo(feed, at);
    const before = (await db.daily.get(TOMORROW)) ?? { cardsSeen: 0, newCards: 0, xp: 0 };

    await answerRight(feed, at);

    expect(await db.reviewLog.toArray()).toEqual([
      expect.objectContaining({ cardId, rating: GRADE.good, mode: 'feed' }),
    ]);
    expect((await db.cardState.get(cardId))?.srs?.due).toBeGreaterThan(Date.now());
    expect(await db.daily.get(TOMORROW)).toMatchObject({
      cardsSeen: before.cardsSeen + 1,
      newCards: before.newCards,
      xp: before.xp + 10,
    });
    expect(state(feed).stats[0]?.newTitles).toEqual([]);
  });

  it('starts a new queue when the feed is opened again on another day', async () => {
    const feed = await start();
    await walkTo(feed, 3);
    vi.advanceTimersByTime(3_000);
    await until(() => state(feed).stats.length === 1, 'a card to count');
    const yesterday = queue(feed);

    feed.detach();
    vi.setSystemTime(DAY_2);
    feed.attach();

    expect(state(feed).status).toBe('loading');
    await until(() => state(feed).status === 'ready', 'the new session');
    expect(state(feed)).toMatchObject({ pageIndex: 0, stats: [], reward: null });
    expect(queue(feed)).not.toEqual(yesterday);
    // Yesterday's four cards are due now, and three of them are in the batch.
    expect(queue(feed).filter((entry) => entry.source === 'due')).toHaveLength(3);
  });

  it('starts a new queue when the app comes back to the foreground on another day', async () => {
    const feed = await start();
    await walkTo(feed, 3);

    setVisibility('hidden');
    vi.setSystemTime(DAY_2);
    setVisibility('visible');

    expect(state(feed).status).toBe('loading');
    await until(() => state(feed).status === 'ready', 'the new session');
    expect(state(feed).pageIndex).toBe(0);
    expect(queue(feed).some((entry) => entry.source === 'due')).toBe(true);
  });

  it('keeps the queue and the place when the reader returns the same day', async () => {
    const feed = await start();
    await walkTo(feed, 3);
    const before = queue(feed);

    feed.detach();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    setVisibility('hidden');
    setVisibility('visible');
    feed.attach();
    await idle();

    expect(state(feed).status).toBe('ready');
    expect(state(feed).pageIndex).toBe(3);
    expect(queue(feed)).toEqual(before);
  });

  it('does not ask again in the feed what a review session has just covered', async () => {
    await seeOnDayOne(DUE);
    vi.setSystemTime(DAY_2);
    const feed = await start();
    const waiting = queue(feed).filter((entry, index) => entry.source === 'due' && index > 0);
    expect(waiting.length).toBeGreaterThan(0);
    const reviewed = waiting[0]!.cardId;

    // The reader opens a review session, which gets to the card first.
    feed.detach();
    await recordAnswer(
      db,
      {
        cardId: reviewed,
        correct: true,
        responseMs: 3_000,
        grade: GRADE.good,
        mode: 'review',
        countCard: true,
        newCard: false,
      },
      new Date(),
    );
    feed.attach();

    await until(
      () => !queue(feed).some((entry) => entry.cardId === reviewed),
      'the answered card to leave the queue',
    );
    expect(queue(feed)).toHaveLength(9);
  });
});
