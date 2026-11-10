import { describe, expect, it } from 'vitest';
import {
  buildBatch,
  buildReviewQueue,
  countDue,
  entryLoad,
  isFirstReading,
  isRetrieval,
  orderViolations,
  pickWeighted,
  type FeedEntry,
  type MixerCardState,
  type MixerSnapshot,
} from './mixer.ts';
import { seededRng, snapshotOf, stepsOf, type CategorySpec } from './testing.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-11-10T18:00:00Z');

const NO_VIOLATIONS = { category: false, topic: false, heavy: false };

/** A realistic library: three selected categories, mixed formats, and one unselected category. */
const LIBRARY: CategorySpec[] = [
  {
    id: 'fyzika',
    attribute: 'T',
    topics: [
      { slug: 'dynamika', cards: 'C2 C3 F3 Q2 E2 C3 D2 Q3 C3! M2' },
      {
        slug: 'rotacia',
        cards: 'C3 F3 C3 Q3 E3 C4 F4 M3 Q4 D3',
        prerequisites: ['fyzika.dynamika'],
      },
    ],
  },
  {
    id: 'robotika',
    attribute: 'T',
    topics: [
      { slug: 'zaklady', cards: 'C2 C2! E2 Q2 C3 D2 C3 M2 Q3 E3' },
      { slug: 'kinematika', cards: 'C3 C3 F4 Q3 C4! E3 M3 C4 Q4 D3' },
    ],
  },
  {
    id: 'veci',
    attribute: 'W',
    target: 2,
    topics: [
      { slug: 'domacnost', cards: 'C1 D1 C2 Q1 E1 C2 M1 Q2 D2 C2' },
      { slug: 'siete', cards: 'C2 E1 F2 Q2 D1 C2 M2 C2 Q2 E2' },
    ],
  },
  {
    id: 'jazyky',
    attribute: 'J',
    weight: 0,
    topics: [{ slug: 'vyroba', cards: 'C3 V1 V2 V3 Q2 V1 V2' }],
  },
];

function count(entries: readonly FeedEntry[], source: FeedEntry['source']): number {
  return entries.filter((entry) => entry.source === source).length;
}

function categoryOf(cardId: string): string {
  return cardId.split('.')[0]!;
}

function topicOf(cardId: string): string {
  return cardId.split('.').slice(0, 2).join('.');
}

/** A state for a card that was read `daysAgo` days ago and has a review due since `dueAgo`. */
function seenState(cardId: string, patch: Partial<MixerCardState> = {}): MixerCardState {
  return {
    cardId,
    due: NOW.getTime() + DAY,
    lastSeenAt: NOW.getTime() - 10 * DAY,
    testedToday: false,
    ...patch,
  };
}

/**
 * Plays several batches in a row the way the feed does: every entry is "shown", new cards become
 * seen (due tomorrow), retrievals are answered (due in three days), and the next batch is built
 * with the tail of the previous one as context.
 */
function play(
  start: MixerSnapshot,
  batches: number,
  seed: number,
): { entries: FeedEntry[]; perBatch: FeedEntry[][]; end: MixerSnapshot } {
  const rng = seededRng(seed);
  const states = new Map(start.states.map((state) => [state.cardId, state]));
  const answeredOnSight = new Map(
    start.cards.map((card) => [card.id, card.type === 'quiz' || card.type === 'myth']),
  );
  const entries: FeedEntry[] = [];
  const perBatch: FeedEntry[][] = [];
  let newCardsToday = start.newCardsToday;
  let snapshot = start;

  for (let round = 0; round < batches; round += 1) {
    snapshot = {
      ...start,
      states: [...states.values()],
      newCardsToday,
      previous: entries.slice(-3),
      pending: [],
    };
    const batch = buildBatch(snapshot, NOW, rng);
    perBatch.push(batch);
    for (const entry of batch) {
      entries.push(entry);
      if (isFirstReading(entry.source)) {
        newCardsToday += 1;
        states.set(entry.cardId, {
          cardId: entry.cardId,
          due: NOW.getTime() + 10 * HOUR,
          lastSeenAt: NOW.getTime(),
          // A quiz or a myth is answered the moment it is first shown.
          testedToday: answeredOnSight.get(entry.cardId) === true,
        });
      } else {
        states.set(entry.cardId, {
          cardId: entry.cardId,
          due: NOW.getTime() + 3 * DAY,
          lastSeenAt: NOW.getTime(),
          testedToday: true,
        });
      }
    }
  }
  return { entries, perBatch, end: { ...snapshot, states: [...states.values()], newCardsToday } };
}

/** States that make `n` cards of the library due, spread over categories and topics. */
function dueStates(snapshot: MixerSnapshot, n: number): MixerCardState[] {
  // Take cards from the end of each topic so that the "next unread" cards stay at the start.
  const byTopic = new Map<string, string[]>();
  for (const card of snapshot.cards) {
    if (card.categoryId === 'jazyky') continue;
    byTopic.set(card.topicId, [...(byTopic.get(card.topicId) ?? []), card.id]);
  }
  const picked: string[] = [];
  for (let round = 1; picked.length < n && round <= 10; round += 1) {
    for (const ids of byTopic.values()) {
      const id = ids[ids.length - round];
      if (id && picked.length < n) picked.push(id);
    }
  }
  return picked.map((cardId, index) =>
    seenState(cardId, { due: NOW.getTime() - (index + 1) * HOUR }),
  );
}

describe('pickWeighted', () => {
  it('picks in proportion to the weights', () => {
    const rng = seededRng(7);
    const tally = { a: 0, b: 0, c: 0 };
    const items = ['a', 'b', 'c'] as const;
    const weights = { a: 1, b: 3, c: 0 };
    for (let i = 0; i < 4000; i += 1)
      tally[pickWeighted(items, (item) => weights[item], rng)!] += 1;
    expect(tally.c).toBe(0);
    expect(tally.b / tally.a).toBeGreaterThan(2.6);
    expect(tally.b / tally.a).toBeLessThan(3.4);
  });

  it('handles empty lists and all-zero weights', () => {
    expect(pickWeighted<string>([], () => 1, seededRng(1))).toBeUndefined();
    expect(pickWeighted(['x', 'y'], () => 0, seededRng(1))).toBe('x');
  });
});

describe('entry kinds', () => {
  it('tells first readings from retrievals', () => {
    expect(
      ['new', 'serendipity', 'due', 'recent', 'repeat'].map((s) => isFirstReading(s as never)),
    ).toEqual([true, true, false, false, false]);
    expect(
      ['new', 'serendipity', 'due', 'recent', 'repeat'].map((s) => isRetrieval(s as never)),
    ).toEqual([false, false, true, true, false]);
  });

  it('treats a retrieval as interactive, whatever the type of the card', () => {
    expect(entryLoad('new', 'concept')).toBe('heavy');
    expect(entryLoad('repeat', 'formula')).toBe('heavy');
    expect(entryLoad('due', 'concept')).toBe('interactive');
    expect(entryLoad('recent', 'formula')).toBe('interactive');
    expect(entryLoad('new', 'quiz')).toBe('interactive');
    expect(entryLoad('serendipity', 'vocab')).toBe('light');
  });
});

describe('orderViolations', () => {
  const step = (categoryId: string, topic: string, load: 'heavy' | 'light' | 'interactive') => ({
    categoryId,
    topicId: `${categoryId}.${topic}`,
    load,
  });

  it('accepts two in a row from a category and flags a third', () => {
    const two = [step('a', 'x', 'light'), step('a', 'y', 'light'), step('b', 'x', 'light')];
    expect(orderViolations(two)).toEqual(NO_VIOLATIONS);
    const three = [step('a', 'x', 'light'), step('a', 'y', 'light'), step('a', 'x', 'light')];
    expect(orderViolations(three).category).toBe(true);
  });

  it('flags the same topic twice in a row', () => {
    expect(orderViolations([step('a', 'x', 'light'), step('a', 'x', 'light')]).topic).toBe(true);
  });

  it('accepts three heavy cards in a row and flags a fourth', () => {
    const heavy = (n: number) => step(n % 2 ? 'a' : 'b', `t${n}`, 'heavy');
    expect(orderViolations([heavy(1), heavy(2), heavy(3)])).toEqual(NO_VIOLATIONS);
    expect(orderViolations([heavy(1), heavy(2), heavy(3), heavy(4)]).heavy).toBe(true);
  });

  it('lets an interactive card break a heavy run without counting as heavy', () => {
    const steps = [
      step('a', 't1', 'heavy'),
      step('b', 't2', 'heavy'),
      step('a', 't3', 'heavy'),
      step('b', 't4', 'interactive'),
      step('a', 't5', 'heavy'),
      step('b', 't6', 'heavy'),
    ];
    expect(orderViolations(steps)).toEqual(NO_VIOLATIONS);
  });
});

describe('buildBatch: composition', () => {
  it('builds ten cards: six new, three retrievals, one serendipity', () => {
    const snapshot = snapshotOf(LIBRARY);
    const batch = buildBatch({ ...snapshot, states: dueStates(snapshot, 12) }, NOW, seededRng(1));
    expect(batch).toHaveLength(10);
    expect(count(batch, 'new')).toBe(6);
    expect(count(batch, 'due')).toBe(3);
    expect(count(batch, 'serendipity')).toBe(1);
  });

  it('grows retrievals to five and shrinks new cards to four with more than 30 due reviews', () => {
    const snapshot = snapshotOf(LIBRARY);
    const exactlyThirty = { ...snapshot, states: dueStates(snapshot, 30) };
    expect(countDue(exactlyThirty, NOW)).toBe(30);
    expect(count(buildBatch(exactlyThirty, NOW, seededRng(1)), 'due')).toBe(3);

    const backlog = { ...snapshot, states: dueStates(snapshot, 31) };
    const batch = buildBatch(backlog, NOW, seededRng(1));
    expect(batch).toHaveLength(10);
    expect(count(batch, 'due')).toBe(5);
    expect(count(batch, 'new')).toBe(4);
    expect(count(batch, 'serendipity')).toBe(1);
  });

  it('never shows the same card twice in a batch', () => {
    const snapshot = snapshotOf(LIBRARY);
    for (let seed = 1; seed <= 50; seed += 1) {
      const batch = buildBatch(
        { ...snapshot, states: dueStates(snapshot, 20) },
        NOW,
        seededRng(seed),
      );
      expect(new Set(batch.map((entry) => entry.cardId)).size).toBe(batch.length);
    }
  });

  it('spreads retrievals over the batch instead of bunching them', () => {
    const snapshot = snapshotOf(LIBRARY);
    for (let seed = 1; seed <= 50; seed += 1) {
      const batch = buildBatch(
        { ...snapshot, states: dueStates(snapshot, 12) },
        NOW,
        seededRng(seed),
      );
      const positions = batch.flatMap((entry, index) => (entry.source === 'due' ? [index] : []));
      // At least one retrieval in each third of the batch: slots 0–2, 3–5 and 6–9. There can be
      // more than three, because a review also steps in where a new card would break a rule.
      expect(positions.length).toBeGreaterThanOrEqual(3);
      expect(positions.some((position) => position <= 2)).toBe(true);
      expect(positions.some((position) => position >= 3 && position <= 5)).toBe(true);
      expect(positions.some((position) => position >= 6)).toBe(true);
    }
  });

  it('is deterministic for a given random source', () => {
    const snapshot = snapshotOf(LIBRARY);
    const withDue = { ...snapshot, states: dueStates(snapshot, 12) };
    expect(buildBatch(withDue, NOW, seededRng(42))).toEqual(
      buildBatch(withDue, NOW, seededRng(42)),
    );
    const variants = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(buildBatch(withDue, NOW, seededRng(seed)))),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('returns an empty batch when there is no content', () => {
    expect(buildBatch(snapshotOf([]), NOW, seededRng(1))).toEqual([]);
  });
});

describe('buildBatch: order rules', () => {
  it('holds all three rules over whole sessions, across batch boundaries', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const start = snapshotOf(LIBRARY);
      // Plenty of due reviews, so a rule-abiding card always exists.
      const { entries } = play({ ...start, states: dueStates(start, 40) }, 5, seed);
      expect(entries.length, `seed ${seed}`).toBe(50);
      expect(orderViolations(stepsOf(entries, start.cards)), `seed ${seed}`).toEqual(NO_VIOLATIONS);
    }
  });

  it('never puts more than two cards of one category in a row', () => {
    const start = snapshotOf(LIBRARY);
    const { entries } = play({ ...start, states: dueStates(start, 40) }, 5, 11);
    let run = 0;
    let longest = 0;
    entries.forEach((entry, index) => {
      const same = index > 0 && categoryOf(entries[index - 1]!.cardId) === categoryOf(entry.cardId);
      run = same ? run + 1 : 1;
      longest = Math.max(longest, run);
    });
    expect(longest).toBeLessThanOrEqual(2);
    // The rule is not vacuous: pairs from one category do occur.
    expect(longest).toBe(2);
  });

  it('never repeats a topic back to back', () => {
    const start = snapshotOf(LIBRARY);
    const { entries } = play({ ...start, states: dueStates(start, 40) }, 5, 12);
    for (let index = 1; index < entries.length; index += 1) {
      expect(topicOf(entries[index]!.cardId)).not.toBe(topicOf(entries[index - 1]!.cardId));
    }
  });

  it('never puts more than three heavy cards in a row, even in heavy-leaning content', () => {
    const heavyLeaning: CategorySpec[] = [
      {
        id: 'a',
        topics: [
          { slug: 't1', cards: 'C C C F C C Q C C F C C' },
          { slug: 't2', cards: 'F C C C C E C C C C' },
        ],
      },
      {
        id: 'b',
        topics: [
          { slug: 't1', cards: 'C F C C C C D C F C' },
          { slug: 't2', cards: 'C C C Q C C C C C M' },
        ],
      },
      {
        id: 'c',
        topics: [
          { slug: 't1', cards: 'C C F C C C C C E C' },
          { slug: 't2', cards: 'F F C C C C Q C C C' },
        ],
      },
      {
        id: 'reviews',
        topics: [
          { slug: 'r1', cards: 'C C C C C C C C' },
          { slug: 'r2', cards: 'C C C C C C C C' },
        ],
      },
    ];
    for (let seed = 1; seed <= 60; seed += 1) {
      const start = snapshotOf(heavyLeaning);
      // All cards of the "reviews" category are seen and due: retrievals can break a heavy run.
      const states = start.cards
        .filter((card) => card.categoryId === 'reviews')
        .map((card, index) => seenState(card.id, { due: NOW.getTime() - (index + 1) * HOUR }));
      const { entries } = play({ ...start, states }, 3, seed);
      const steps = stepsOf(entries, start.cards);
      expect(orderViolations(steps).heavy, `seed ${seed}`).toBe(false);
      // The content really is heavy: runs of three do happen.
      expect(steps.filter((step) => step.load === 'heavy').length).toBeGreaterThan(12);
    }
  });

  it('respects the cards shown just before the batch', () => {
    const snapshot = snapshotOf(LIBRARY);
    const previous: FeedEntry[] = [
      { cardId: 'fyzika.dynamika.k01', source: 'new' },
      { cardId: 'fyzika.rotacia.k01', source: 'new' },
    ];
    const states = [
      ...dueStates(snapshot, 30).filter((state) => !state.cardId.endsWith('.k01')),
      seenState(previous[0]!.cardId),
      seenState(previous[1]!.cardId),
    ];
    for (let seed = 1; seed <= 40; seed += 1) {
      const batch = buildBatch({ ...snapshot, states, previous }, NOW, seededRng(seed));
      // Two cards from "fyzika" were just shown, so the batch must not open with a third.
      expect(categoryOf(batch[0]!.cardId), `seed ${seed}`).not.toBe('fyzika');
      expect(orderViolations(stepsOf([...previous, ...batch], snapshot.cards))).toEqual(
        NO_VIOLATIONS,
      );
    }
  });

  describe('when content is too scarce to obey a rule', () => {
    it('keeps going with a single category, still alternating its topics', () => {
      const single: CategorySpec[] = [
        {
          id: 'solo',
          topics: [
            { slug: 'a', cards: 'E Q E D E' },
            { slug: 'b', cards: 'D E Q E D' },
          ],
        },
      ];
      const batch = buildBatch(snapshotOf(single), NOW, seededRng(3));
      expect(batch).toHaveLength(10);
      const violations = orderViolations(stepsOf(batch, snapshotOf(single).cards));
      expect(violations.category).toBe(true);
      expect(violations.topic).toBe(false);
    });

    it('keeps going with a single topic', () => {
      const one: CategorySpec[] = [{ id: 'solo', topics: [{ slug: 'a', cards: 'E Q E D E Q' }] }];
      const batch = buildBatch(snapshotOf(one), NOW, seededRng(3));
      expect(batch.map((entry) => entry.cardId)).toEqual(
        ['k01', 'k02', 'k03', 'k04', 'k05', 'k06'].map((slug) => `solo.a.${slug}`),
      );
    });

    it('shows a fourth heavy card rather than nothing', () => {
      const heavyOnly: CategorySpec[] = [
        { id: 'a', topics: [{ slug: 't', cards: 'C C C' }] },
        { id: 'b', topics: [{ slug: 't', cards: 'C C C' }] },
      ];
      const batch = buildBatch(snapshotOf(heavyOnly), NOW, seededRng(3));
      expect(batch).toHaveLength(6);
      expect(orderViolations(stepsOf(batch, snapshotOf(heavyOnly).cards)).heavy).toBe(true);
    });

    it('gives up the topic rule before the limit on heavy cards', () => {
      // Three concepts were just shown, the last one from a.t. Every topic's next card is heavy
      // except the example that follows in a.t itself.
      const specs: CategorySpec[] = [
        { id: 'a', topics: [{ slug: 't', cards: 'C E C C' }] },
        { id: 'b', topics: [{ slug: 't', cards: 'C C C C' }] },
        { id: 'c', topics: [{ slug: 't', cards: 'C C C C' }] },
      ];
      const previous: FeedEntry[] = [
        { cardId: 'b.t.k01', source: 'new' },
        { cardId: 'c.t.k01', source: 'new' },
        { cardId: 'a.t.k01', source: 'new' },
      ];
      const states = previous.map((entry) => seenState(entry.cardId));
      const batch = buildBatch(snapshotOf(specs, { states, previous }), NOW, seededRng(5));
      expect(batch[0]).toEqual({ cardId: 'a.t.k02', source: 'new' });
      const violations = orderViolations(
        stepsOf([...previous, batch[0]!], snapshotOf(specs).cards),
      );
      expect(violations).toEqual({ category: false, topic: true, heavy: false });
    });

    it('offers a surprise card before breaking a rule', () => {
      // Same situation, but an unselected category has a light card to offer.
      const specs: CategorySpec[] = [
        { id: 'a', topics: [{ slug: 't', cards: 'C E C C' }] },
        { id: 'b', topics: [{ slug: 't', cards: 'C C C C' }] },
        { id: 'c', topics: [{ slug: 't', cards: 'C C C C' }] },
        { id: 'elsewhere', weight: 0, topics: [{ slug: 't', cards: 'D1 D1' }] },
      ];
      const previous: FeedEntry[] = [
        { cardId: 'b.t.k01', source: 'new' },
        { cardId: 'c.t.k01', source: 'new' },
        { cardId: 'a.t.k01', source: 'new' },
      ];
      const states = previous.map((entry) => seenState(entry.cardId));
      for (let seed = 1; seed <= 20; seed += 1) {
        const batch = buildBatch(snapshotOf(specs, { states, previous }), NOW, seededRng(seed));
        expect(batch[0], `seed ${seed}`).toEqual({
          cardId: 'elsewhere.t.k01',
          source: 'serendipity',
        });
      }
      // With the setting off there is no surprise to fall back on.
      const off = buildBatch(
        snapshotOf(specs, { states, previous, serendipity: false }),
        NOW,
        seededRng(5),
      );
      expect(off[0]).toEqual({ cardId: 'a.t.k02', source: 'new' });
    });

    it('prefers a review that obeys the rules over a new card that breaks them', () => {
      // Three heavy cards were just shown. The only unread cards are heavy, but a review is due.
      const specs: CategorySpec[] = [
        { id: 'a', topics: [{ slug: 't', cards: 'C C C C' }] },
        { id: 'b', topics: [{ slug: 't', cards: 'C C C C' }] },
        { id: 'c', topics: [{ slug: 't', cards: 'C C' }] },
      ];
      const previous: FeedEntry[] = [
        { cardId: 'a.t.k01', source: 'new' },
        { cardId: 'b.t.k01', source: 'new' },
        { cardId: 'a.t.k02', source: 'new' },
      ];
      const states = [
        ...previous.map((entry) => seenState(entry.cardId)),
        seenState('c.t.k01', { due: NOW.getTime() - HOUR }),
      ];
      const batch = buildBatch(snapshotOf(specs, { states, previous }), NOW, seededRng(5));
      expect(batch[0]).toEqual({ cardId: 'c.t.k01', source: 'due' });
    });
  });
});

describe('buildBatch: new cards', () => {
  it('reads each topic in order', () => {
    const start = snapshotOf(LIBRARY);
    const { entries } = play(start, 6, 21);
    const perTopic = new Map<string, string[]>();
    for (const entry of entries) {
      if (entry.source !== 'new') continue;
      const topic = topicOf(entry.cardId);
      perTopic.set(topic, [...(perTopic.get(topic) ?? []), entry.cardId]);
    }
    expect(perTopic.size).toBeGreaterThan(3);
    for (const [topic, ids] of perTopic) {
      // All targets are within one step of every difficulty here, so order alone decides.
      if (topic === 'robotika.kinematika' || topic === 'fyzika.rotacia') continue;
      expect(ids, topic).toEqual([...ids].sort());
    }
  });

  it('prefers a difficulty within one step of the category target', () => {
    const specs: CategorySpec[] = [
      { id: 'a', target: 2, topics: [{ slug: 't', cards: 'C5 C4 E3 C1 D2' }] },
    ];
    const order = buildBatch(snapshotOf(specs), NOW, seededRng(1)).map((entry) => entry.cardId);
    // Within reach of target 2 first (k03, k04, k05), then the rest in order (k01, k02).
    expect(order).toEqual(['a.t.k03', 'a.t.k04', 'a.t.k05', 'a.t.k01', 'a.t.k02']);
  });

  it('follows a moved target', () => {
    const specs: CategorySpec[] = [
      { id: 'a', target: 5, topics: [{ slug: 't', cards: 'C1 C2 C5 C4' }] },
    ];
    expect(buildBatch(snapshotOf(specs), NOW, seededRng(1))[0]!.cardId).toBe('a.t.k03');
  });

  it('serves an easier card of a topic after "Nerozumiem"', () => {
    const specs: CategorySpec[] = [
      { id: 'a', target: 3, topics: [{ slug: 't', cards: 'C3 C4 C3 E2 C3' }] },
    ];
    const states = [seenState('a.t.k01'), seenState('a.t.k02')];
    const normal = buildBatch(snapshotOf(specs, { states }), NOW, seededRng(1));
    expect(normal[0]!.cardId).toBe('a.t.k03');
    // The reader did not understand the difficulty-4 card: the difficulty-2 card comes first.
    const eased = buildBatch(
      snapshotOf(specs, { states, easier: { 'a.t': 4 } }),
      NOW,
      seededRng(1),
    );
    expect(eased[0]!.cardId).toBe('a.t.k03');
    const easedHarder = buildBatch(
      snapshotOf(specs, { states, easier: { 'a.t': 3 } }),
      NOW,
      seededRng(1),
    );
    expect(easedHarder[0]!.cardId).toBe('a.t.k04');
  });

  it('never shows a card that was already seen as new again', () => {
    const start = snapshotOf(LIBRARY);
    const { entries } = play(start, 8, 5);
    const firstReadings = entries
      .filter((entry) => isFirstReading(entry.source))
      .map((e) => e.cardId);
    expect(new Set(firstReadings).size).toBe(firstReadings.length);
  });

  it('follows the category weights', () => {
    const specs: CategorySpec[] = [
      { id: 'heavy', weight: 90, topics: [{ slug: 't', cards: 'E '.repeat(400) }] },
      { id: 'light', weight: 30, topics: [{ slug: 't', cards: 'E '.repeat(400) }] },
      { id: 'other', weight: 30, topics: [{ slug: 't', cards: 'E '.repeat(400) }] },
    ];
    const tally: Record<string, number> = { heavy: 0, light: 0, other: 0 };
    for (let seed = 1; seed <= 300; seed += 1) {
      // The first card of a batch has no history, so only the weights decide it.
      const first = buildBatch(snapshotOf(specs, { serendipity: false }), NOW, seededRng(seed))[0]!;
      tally[categoryOf(first.cardId)]! += 1;
    }
    expect(tally.heavy! / 300).toBeGreaterThan(0.5);
    expect(tally.heavy! / 300).toBeLessThan(0.7); // 90 of 150 = 60 %
    expect(tally.light! + tally.other!).toBeGreaterThan(90);
  });

  it('scales a category by the mean affinity of its unlocked topics', () => {
    const specs = (affinity: number): CategorySpec[] => [
      { id: 'liked', topics: [{ slug: 't', cards: 'E '.repeat(50), affinity }] },
      { id: 'plain', topics: [{ slug: 't', cards: 'E '.repeat(50) }] },
    ];
    const share = (affinity: number) => {
      let liked = 0;
      for (let seed = 1; seed <= 400; seed += 1) {
        const first = buildBatch(
          snapshotOf(specs(affinity), { serendipity: false }),
          NOW,
          seededRng(seed),
        )[0]!;
        if (categoryOf(first.cardId) === 'liked') liked += 1;
      }
      return liked / 400;
    };
    expect(share(1)).toBeGreaterThan(0.43);
    expect(share(1)).toBeLessThan(0.57);
    expect(share(2)).toBeGreaterThan(0.6); // 2 of 3
    expect(share(2)).toBeLessThan(0.73);
    expect(share(0.5)).toBeLessThan(0.4); // 1 of 3
  });

  it('never picks from a category with weight zero', () => {
    const specs: CategorySpec[] = [
      { id: 'on', topics: [{ slug: 't', cards: 'C C C C C C C C C C C C' }] },
      { id: 'off', weight: 0, topics: [{ slug: 't', cards: 'C C C C C C' }] },
    ];
    for (let seed = 1; seed <= 30; seed += 1) {
      const batch = buildBatch(snapshotOf(specs), NOW, seededRng(seed));
      expect(batch.every((entry) => categoryOf(entry.cardId) === 'on')).toBe(true);
    }
  });

  it('prefers a topic that is already in progress', () => {
    const specs: CategorySpec[] = [
      {
        id: 'a',
        topics: [
          { slug: 'started', cards: 'E '.repeat(30) },
          { slug: 'fresh', cards: 'E '.repeat(30) },
        ],
      },
      { id: 'b', topics: [{ slug: 'x', cards: 'E '.repeat(30) }] },
    ];
    // One card of "started" has been seen. The previous card came from category b.
    const context = {
      states: [seenState('a.started.k01'), seenState('b.x.k01')],
      previous: [{ cardId: 'b.x.k01', source: 'new' as const }],
      serendipity: false,
    };
    let started = 0;
    let fresh = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const first = buildBatch(snapshotOf(specs, context), NOW, seededRng(seed))[0]!;
      if (topicOf(first.cardId) === 'a.started') started += 1;
      if (topicOf(first.cardId) === 'a.fresh') fresh += 1;
    }
    // In-progress topics weigh three times as much.
    expect(started / fresh).toBeGreaterThan(2.2);
    expect(started / fresh).toBeLessThan(4);
  });
});

describe('buildBatch: unlocking topics', () => {
  const specs: CategorySpec[] = [
    {
      id: 'a',
      topics: [
        { slug: 'base', cards: 'E E E E' },
        { slug: 'next', cards: 'E E E E', prerequisites: ['a.base'] },
      ],
    },
    { id: 'b', topics: [{ slug: 'x', cards: 'E E E E E E E E E E E E' }] },
  ];

  const topicsIn = (batch: FeedEntry[]) => new Set(batch.map((entry) => topicOf(entry.cardId)));

  it('keeps a topic locked until half of each prerequisite is seen', () => {
    const none = buildBatch(snapshotOf(specs), NOW, seededRng(1));
    // Only the first batch slot can decide before a.base cards are queued, so look at states.
    const oneSeen = snapshotOf(specs, { states: [seenState('a.base.k01')] });
    const twoSeen = snapshotOf(specs, {
      states: [seenState('a.base.k01'), seenState('a.base.k02')],
    });
    for (let seed = 1; seed <= 30; seed += 1) {
      expect(
        topicsIn(buildBatch(oneSeen, NOW, seededRng(seed))).has('a.next'),
        `seed ${seed}`,
      ).toBe(false);
    }
    const unlocked = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const topic of topicsIn(buildBatch(twoSeen, NOW, seededRng(seed)))) unlocked.add(topic);
    }
    expect(unlocked.has('a.next')).toBe(true);
    expect(topicsIn(none).has('a.next')).toBe(false);
  });

  it('does not count cards that are only queued as seen', () => {
    const pending: FeedEntry[] = [
      { cardId: 'a.base.k01', source: 'new' },
      { cardId: 'a.base.k02', source: 'new' },
    ];
    for (let seed = 1; seed <= 30; seed += 1) {
      const batch = buildBatch(
        snapshotOf(specs, { pending, previous: pending }),
        NOW,
        seededRng(seed),
      );
      expect(topicsIn(batch).has('a.next'), `seed ${seed}`).toBe(false);
    }
  });

  it('ignores a prerequisite that is not part of the content', () => {
    const dangling: CategorySpec[] = [
      { id: 'a', topics: [{ slug: 'only', cards: 'E E E', prerequisites: ['matematika.matice'] }] },
    ];
    expect(buildBatch(snapshotOf(dangling), NOW, seededRng(1))).toHaveLength(3);
  });

  it('ignores a prerequisite from a category the reader did not select', () => {
    const cross: CategorySpec[] = [
      { id: 'math', weight: 0, topics: [{ slug: 'matrices', cards: 'C C C C' }] },
      {
        id: 'robots',
        topics: [{ slug: 'kinematics', cards: 'E E E', prerequisites: ['math.matrices'] }],
      },
    ];
    const batch = buildBatch(snapshotOf(cross, { serendipity: false }), NOW, seededRng(1));
    expect(batch.map((entry) => entry.cardId)).toEqual([
      'robots.kinematics.k01',
      'robots.kinematics.k02',
      'robots.kinematics.k03',
    ]);
  });

  it('enforces a prerequisite from another selected category', () => {
    const cross: CategorySpec[] = [
      { id: 'math', topics: [{ slug: 'matrices', cards: 'E E E E' }] },
      {
        id: 'robots',
        topics: [{ slug: 'kinematics', cards: 'E E E', prerequisites: ['math.matrices'] }],
      },
    ];
    const locked = buildBatch(snapshotOf(cross), NOW, seededRng(1));
    expect(locked.every((entry) => categoryOf(entry.cardId) === 'math')).toBe(true);
  });
});

describe('buildBatch: daily cap on new cards', () => {
  it('stops adding new cards at the cap and fills the slots with reviews', () => {
    const snapshot = snapshotOf(LIBRARY);
    const batch = buildBatch(
      { ...snapshot, states: dueStates(snapshot, 20), newCardsToday: 38, newCardCap: 40 },
      NOW,
      seededRng(2),
    );
    expect(batch).toHaveLength(10);
    expect(batch.filter((entry) => isFirstReading(entry.source))).toHaveLength(2);
    expect(count(batch, 'due')).toBe(8);
  });

  it('counts queued new cards toward the cap', () => {
    const snapshot = snapshotOf(LIBRARY);
    const pending: FeedEntry[] = [
      { cardId: 'fyzika.dynamika.k01', source: 'new' },
      { cardId: 'robotika.zaklady.k01', source: 'new' },
      { cardId: 'veci.domacnost.k01', source: 'new' },
    ];
    const batch = buildBatch(
      { ...snapshot, newCardsToday: 36, newCardCap: 40, pending, previous: pending },
      NOW,
      seededRng(2),
    );
    expect(batch.filter((entry) => isFirstReading(entry.source))).toHaveLength(1);
  });

  it('ends the feed at the cap when nothing can be reviewed', () => {
    const batch = buildBatch(
      { ...snapshotOf(LIBRARY), newCardsToday: 40, newCardCap: 40 },
      NOW,
      seededRng(2),
    );
    expect(batch).toEqual([]);
  });

  it('never exceeds the cap over a whole day', () => {
    const { end, entries } = play({ ...snapshotOf(LIBRARY), newCardCap: 25 }, 8, 9);
    expect(end.newCardsToday).toBe(25);
    expect(entries.filter((entry) => isFirstReading(entry.source))).toHaveLength(25);
  });
});

describe('buildBatch: retrieval', () => {
  const specs: CategorySpec[] = [
    {
      id: 'a',
      attribute: 'T',
      topics: [
        { slug: 't1', cards: 'C C C C' },
        { slug: 't2', cards: 'C C C C' },
      ],
    },
    {
      id: 'b',
      attribute: 'W',
      topics: [
        { slug: 't1', cards: 'C C C C' },
        { slug: 't2', cards: 'C C C C' },
      ],
    },
  ];

  /** The first due entry of a batch built with the given states and context. */
  const firstDue = (overrides: Partial<MixerSnapshot>) =>
    buildReviewQueue(snapshotOf(specs, overrides), NOW, 1)[0]?.cardId;

  it('serves the most overdue card first', () => {
    const states = [
      seenState('a.t1.k01', { due: NOW.getTime() - 2 * HOUR }),
      seenState('b.t1.k01', { due: NOW.getTime() - 50 * HOUR }),
      seenState('a.t2.k01', { due: NOW.getTime() - 5 * HOUR }),
    ];
    expect(buildReviewQueue(snapshotOf(specs, { states }), NOW, 10).map((e) => e.cardId)).toEqual([
      'b.t1.k01',
      'a.t2.k01',
      'a.t1.k01',
    ]);
  });

  it('does not serve a card before it is due', () => {
    const states = [
      seenState('a.t1.k01', { due: NOW.getTime() + 1 }),
      seenState('a.t2.k01', { due: NOW.getTime() }),
      seenState('b.t1.k01', { due: null }),
    ];
    expect(buildReviewQueue(snapshotOf(specs, { states }), NOW, 10).map((e) => e.cardId)).toEqual([
      'a.t2.k01',
    ]);
  });

  it('prefers a category other than the previous card', () => {
    const states = [
      seenState('a.t1.k01', { due: NOW.getTime() - 50 * HOUR }),
      seenState('b.t1.k01', { due: NOW.getTime() - 2 * HOUR }),
      seenState('a.t2.k04'),
    ];
    // Without context the most overdue card wins.
    expect(firstDue({ states })).toBe('a.t1.k01');
    // After a card from category a, the less overdue card from b goes first.
    expect(firstDue({ states, previous: [{ cardId: 'a.t2.k04', source: 'new' }] })).toBe(
      'b.t1.k01',
    );
  });

  it('prefers an attribute whose sharpness is below 70 %', () => {
    const states = [
      seenState('a.t1.k01', { due: NOW.getTime() - 50 * HOUR }),
      seenState('b.t1.k01', { due: NOW.getTime() - 2 * HOUR }),
    ];
    const sharp = { T: 0.95, R: null, B: null, M: null, W: 0.9, J: null };
    expect(firstDue({ states, sharpness: sharp })).toBe('a.t1.k01');
    expect(firstDue({ states, sharpness: { ...sharp, W: 0.69 } })).toBe('b.t1.k01');
    expect(firstDue({ states, sharpness: { ...sharp, W: 0.7 } })).toBe('a.t1.k01');
  });

  it('skips reviews of cards that no longer exist', () => {
    const states = [
      seenState('gone.t.k01', { due: NOW.getTime() - DAY }),
      seenState('a.t1.k01', { due: NOW.getTime() - HOUR }),
    ];
    expect(countDue(snapshotOf(specs, { states }), NOW)).toBe(1);
    expect(firstDue({ states })).toBe('a.t1.k01');
  });

  it('falls back to a quiz on a recently seen card when nothing is due', () => {
    const quizSpecs: CategorySpec[] = [
      { id: 'a', topics: [{ slug: 't', cards: 'C! C Q M E' }] },
      { id: 'b', topics: [{ slug: 't', cards: 'E E E E E E E E E E E E' }] },
    ];
    const recently = NOW.getTime() - 5 * HOUR;
    const states = [
      seenState('a.t.k01', { lastSeenAt: recently }), // concept with an embedded quiz
      seenState('a.t.k02', { lastSeenAt: recently }), // concept without a quiz: not eligible
      seenState('a.t.k03', { lastSeenAt: recently, testedToday: true }), // already answered today
      seenState('a.t.k04', { lastSeenAt: NOW.getTime() - 73 * HOUR }), // too long ago
    ];
    const recent = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const batch = buildBatch(snapshotOf(quizSpecs, { states }), NOW, seededRng(seed));
      for (const entry of batch) if (entry.source === 'recent') recent.add(entry.cardId);
      expect(count(batch, 'due')).toBe(0);
    }
    expect([...recent]).toEqual(['a.t.k01']);
  });

  it('accepts a card seen exactly 72 hours ago for the recent quiz', () => {
    const quizSpecs: CategorySpec[] = [
      { id: 'a', topics: [{ slug: 't', cards: 'Q' }] },
      { id: 'b', topics: [{ slug: 't', cards: 'E E E E E E E E E E E E' }] },
    ];
    const states = [seenState('a.t.k01', { lastSeenAt: NOW.getTime() - 72 * HOUR })];
    const batch = buildBatch(snapshotOf(quizSpecs, { states }), NOW, seededRng(1));
    expect(count(batch, 'recent')).toBe(1);
  });

  it('falls back to new cards when there is nothing to retrieve', () => {
    const batch = buildBatch(snapshotOf(LIBRARY, { serendipity: false }), NOW, seededRng(1));
    expect(batch).toHaveLength(10);
    expect(count(batch, 'new')).toBe(10);
  });

  it('does not retrieve a card that is already queued', () => {
    const states = [seenState('a.t1.k01', { due: NOW.getTime() - HOUR })];
    const pending: FeedEntry[] = [{ cardId: 'a.t1.k01', source: 'due' }];
    const snapshot = snapshotOf(specs, { states, pending, previous: pending });
    expect(countDue(snapshot, NOW)).toBe(0);
    expect(
      buildBatch(snapshot, NOW, seededRng(1)).some((entry) => entry.cardId === 'a.t1.k01'),
    ).toBe(false);
  });
});

describe('buildBatch: serendipity', () => {
  it('picks a light card of difficulty 2 or less from an unselected category', () => {
    const snapshot = snapshotOf(LIBRARY);
    // jazyky.vyroba is "C3 V1 V2 V3 Q2 V1 V2": only k02, k03, k06 and k07 are light and easy.
    const eligible = ['k02', 'k03', 'k06', 'k07'].map((slug) => `jazyky.vyroba.${slug}`);
    for (let seed = 1; seed <= 40; seed += 1) {
      const batch = buildBatch(snapshot, NOW, seededRng(seed));
      const surprises = batch.filter((entry) => entry.source === 'serendipity');
      // One by plan. A second one can step in where every other card would break an order rule.
      expect(surprises.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(surprises.length, `seed ${seed}`).toBeLessThanOrEqual(2);
      // They come in the order of the topic.
      expect(surprises.map((entry) => entry.cardId)).toEqual(eligible.slice(0, surprises.length));
      // Nothing else in the batch comes from the unselected category.
      const fromJazyky = batch.filter((entry) => categoryOf(entry.cardId) === 'jazyky');
      expect(fromJazyky).toEqual(surprises);
    }
  });

  it('plans exactly one surprise per batch when the rules never need a second', () => {
    const start = snapshotOf(LIBRARY);
    const { perBatch } = play({ ...start, states: dueStates(start, 40) }, 4, 3);
    for (const batch of perBatch) expect(count(batch, 'serendipity')).toBe(1);
  });

  it('moves on to the next eligible card once one was seen', () => {
    const snapshot = snapshotOf(LIBRARY, { states: [seenState('jazyky.vyroba.k02')] });
    const surprise = buildBatch(snapshot, NOW, seededRng(1)).find(
      (entry) => entry.source === 'serendipity',
    );
    expect(surprise?.cardId).toBe('jazyky.vyroba.k03');
  });

  it('becomes a normal new card when the setting is off', () => {
    const batch = buildBatch(snapshotOf(LIBRARY, { serendipity: false }), NOW, seededRng(1));
    expect(count(batch, 'serendipity')).toBe(0);
    expect(batch.every((entry) => categoryOf(entry.cardId) !== 'jazyky')).toBe(true);
    expect(batch).toHaveLength(10);
  });

  it('becomes a normal new card when every category is selected', () => {
    const allSelected = LIBRARY.map((category) => ({ ...category, weight: 50 }));
    const batch = buildBatch(snapshotOf(allSelected), NOW, seededRng(1));
    expect(count(batch, 'serendipity')).toBe(0);
    expect(batch).toHaveLength(10);
  });

  it('never offers a heavy, interactive or hard card as a surprise', () => {
    const specs: CategorySpec[] = [
      { id: 'on', topics: [{ slug: 't', cards: 'E E E E E E E E E E E E' }] },
      { id: 'off', weight: 0, topics: [{ slug: 't', cards: 'C1 Q1 F1 E3 D4 V5' }] },
    ];
    for (let seed = 1; seed <= 20; seed += 1) {
      const batch = buildBatch(snapshotOf(specs), NOW, seededRng(seed));
      expect(count(batch, 'serendipity')).toBe(0);
    }
  });
});

describe('buildReviewQueue', () => {
  it('lists due cards only, up to the limit', () => {
    const snapshot = snapshotOf(LIBRARY);
    const withDue = { ...snapshot, states: dueStates(snapshot, 25) };
    const queue = buildReviewQueue(withDue, NOW, 20);
    expect(queue).toHaveLength(20);
    expect(queue.every((entry) => entry.source === 'due')).toBe(true);
    expect(buildReviewQueue(withDue, NOW, 100)).toHaveLength(25);
    expect(buildReviewQueue(snapshot, NOW, 20)).toEqual([]);
  });

  it('interleaves topics and categories', () => {
    const snapshot = snapshotOf(LIBRARY);
    const queue = buildReviewQueue({ ...snapshot, states: dueStates(snapshot, 30) }, NOW, 30);
    expect(orderViolations(stepsOf(queue, snapshot.cards))).toEqual(NO_VIOLATIONS);
  });
});
