import { describe, expect, it } from 'vitest';
import { entryLoad, orderViolations, type FeedEntry, type FeedStep } from './mixer.ts';
import { needsNextBatch, placeRepeats, scheduleRepeat, toPages } from './session.ts';
import { content, type CategorySpec } from './testing.ts';

const SPECS: CategorySpec[] = [
  {
    id: 'a',
    topics: [
      { slug: 't1', cards: 'C C C C C C' },
      { slug: 't2', cards: 'E E E E E E' },
    ],
  },
  {
    id: 'b',
    topics: [
      { slug: 't1', cards: 'C C C C C C' },
      { slug: 't2', cards: 'E E E E E E' },
    ],
  },
  { id: 'c', topics: [{ slug: 't1', cards: 'E E E E E E' }] },
];

const CARDS = new Map(content(SPECS).cards.map((card) => [card.id, card]));

function describeEntry(entry: FeedEntry): FeedStep | undefined {
  const card = CARDS.get(entry.cardId);
  return (
    card && {
      categoryId: card.categoryId,
      topicId: card.topicId,
      load: entryLoad(entry.source, card.type),
    }
  );
}

function entries(...ids: string[]): FeedEntry[] {
  return ids.map((cardId) => ({ cardId, source: 'new' }));
}

function numbered(count: number): FeedEntry[] {
  return Array.from({ length: count }, (_, index) => ({ cardId: `x.t.k${index}`, source: 'new' }));
}

describe('toPages', () => {
  it('puts a checkpoint after every ten cards', () => {
    const pages = toPages(numbered(25), false);
    expect(pages).toHaveLength(27);
    expect(pages[9]).toMatchObject({ kind: 'card', entryIndex: 9 });
    expect(pages[10]).toEqual({ kind: 'checkpoint', batch: 1 });
    expect(pages[11]).toMatchObject({ kind: 'card', entryIndex: 10 });
    expect(pages[21]).toEqual({ kind: 'checkpoint', batch: 2 });
    expect(pages[26]).toMatchObject({ kind: 'card', entryIndex: 24 });
  });

  it('has no checkpoint before the tenth card', () => {
    expect(toPages(numbered(9), false).every((page) => page.kind === 'card')).toBe(true);
    expect(toPages(numbered(10), false).at(-1)).toEqual({ kind: 'checkpoint', batch: 1 });
  });

  it('closes an exhausted feed with an end page', () => {
    expect(toPages([], true)).toEqual([{ kind: 'end' }]);
    expect(toPages(numbered(3), true).at(-1)).toEqual({ kind: 'end' });
    // After a full batch the checkpoint comes first, then the end.
    expect(toPages(numbered(10), true).slice(-2)).toEqual([
      { kind: 'checkpoint', batch: 1 },
      { kind: 'end' },
    ]);
    expect(toPages(numbered(3), false).some((page) => page.kind === 'end')).toBe(false);
  });
});

describe('needsNextBatch', () => {
  it('asks for the next batch three cards from the end', () => {
    expect(needsNextBatch(10, 5)).toBe(false);
    expect(needsNextBatch(10, 6)).toBe(true);
    expect(needsNextBatch(10, 9)).toBe(true);
    expect(needsNextBatch(20, 15)).toBe(false);
    expect(needsNextBatch(20, 16)).toBe(true);
    expect(needsNextBatch(0, 0)).toBe(true);
  });
});

describe('repeats after "Nerozumiem"', () => {
  const queue = entries(
    'a.t1.k01', // 0: the card that was not understood
    'b.t2.k01',
    'c.t1.k01',
    'a.t2.k01',
    'b.t1.k01',
    'c.t1.k02',
    'b.t2.k02', // 6: the earliest position for the repeat
    'c.t1.k03',
    'a.t2.k02',
    'b.t2.k03',
  );

  it('brings the card back after at least five other cards', () => {
    const repeat = scheduleRepeat(0, 'a.t1.k01');
    expect(repeat.notBefore).toBe(6);

    const result = placeRepeats(queue, [repeat], describeEntry);
    expect(result.waiting).toEqual([]);
    expect(result.entries).toHaveLength(11);
    const position = result.entries.findIndex((entry) => entry.source === 'repeat');
    expect(position).toBe(6);
    expect(result.entries[position]).toEqual({ cardId: 'a.t1.k01', source: 'repeat' });
    // Five other cards separate the two showings.
    expect(position - 0 - 1).toBe(5);
    // Nothing else moved out of order.
    expect(result.entries.filter((entry) => entry.source !== 'repeat')).toEqual(queue);
  });

  it('does not change the queue it was given', () => {
    const copy = [...queue];
    placeRepeats(queue, [scheduleRepeat(0, 'a.t1.k01')], describeEntry);
    expect(queue).toEqual(copy);
  });

  it('waits for the next batch when the queue is still too short', () => {
    const short = queue.slice(0, 4);
    const repeat = scheduleRepeat(2, 'c.t1.k01');
    const result = placeRepeats(short, [repeat], describeEntry);
    expect(result.entries).toEqual(short);
    expect(result.waiting).toEqual([repeat]);

    // Once the queue has grown the repeat finds its place.
    const grown = placeRepeats(queue, result.waiting, describeEntry);
    expect(grown.waiting).toEqual([]);
    expect(grown.entries.findIndex((entry) => entry.source === 'repeat')).toBeGreaterThanOrEqual(8);
  });

  it('skips positions next to a card of the same topic', () => {
    // A ninth card of topic b.t2, which also sits at position 6 of the queue.
    const repeat = scheduleRepeat(0, 'b.t2.k09');
    const withCard = new Map(CARDS);
    withCard.set('b.t2.k09', { ...CARDS.get('b.t2.k01')!, id: 'b.t2.k09' });
    const describeWith = (entry: FeedEntry) => {
      const card = withCard.get(entry.cardId);
      return (
        card && {
          categoryId: card.categoryId,
          topicId: card.topicId,
          load: entryLoad(entry.source, card.type),
        }
      );
    };
    // Position 6 is followed by b.t2.k02 and position 7 follows it: both touch topic b.t2.
    const result = placeRepeats(queue, [repeat], describeWith);
    const position = result.entries.findIndex((entry) => entry.source === 'repeat');
    expect(position).toBe(8);
    expect(
      orderViolations(result.entries.map(describeWith).filter((s) => s !== undefined)),
    ).toEqual({
      category: false,
      topic: false,
      heavy: false,
    });
  });

  it('does not create a run of four heavy cards', () => {
    // Three concepts sit at positions 6–8. A fourth heavy card must not join them.
    const heavyTail = entries(
      'a.t1.k01',
      'c.t1.k01',
      'a.t2.k01',
      'c.t1.k02',
      'b.t2.k01',
      'c.t1.k03',
      'a.t1.k02',
      'b.t1.k01',
      'a.t1.k03',
      'c.t1.k04',
      'b.t2.k02',
    );
    const result = placeRepeats(heavyTail, [scheduleRepeat(0, 'b.t1.k06')], describeEntry);
    const steps = result.entries.map(describeEntry).filter((step) => step !== undefined);
    expect(result.waiting).toEqual([]);
    expect(orderViolations(steps).heavy).toBe(false);
    expect(result.entries.findIndex((entry) => entry.source === 'repeat')).toBeGreaterThanOrEqual(
      9,
    );
  });

  it('keeps waiting when no position obeys the rules, unless the feed is ending', () => {
    const sameTopic = entries(
      'c.t1.k01',
      'a.t2.k01',
      'c.t1.k02',
      'a.t2.k02',
      'c.t1.k03',
      'a.t2.k03',
    );
    const tail = entries('c.t1.k04', 'c.t1.k05');
    const stuck = [...sameTopic, ...tail];
    const repeat = scheduleRepeat(0, 'c.t1.k06');

    const waitingResult = placeRepeats(stuck, [repeat], describeEntry);
    expect(waitingResult.waiting).toEqual([repeat]);
    expect(waitingResult.entries).toEqual(stuck);

    const forced = placeRepeats(stuck, [repeat], describeEntry, true);
    expect(forced.waiting).toEqual([]);
    expect(forced.entries).toHaveLength(stuck.length + 1);
    expect(forced.entries[6]).toEqual({ cardId: 'c.t1.k06', source: 'repeat' });
  });

  it('puts a forced repeat at the end of a queue that is too short', () => {
    const short = entries('a.t1.k01', 'b.t2.k01');
    const forced = placeRepeats(short, [scheduleRepeat(0, 'a.t1.k01')], describeEntry, true);
    expect(forced.entries.at(-1)).toEqual({ cardId: 'a.t1.k01', source: 'repeat' });
    expect(forced.entries).toHaveLength(3);
  });

  it('drops a repeat of a card that no longer exists', () => {
    const result = placeRepeats(queue, [scheduleRepeat(0, 'gone.t.k01')], describeEntry, true);
    expect(result.entries).toEqual(queue);
    expect(result.waiting).toEqual([]);
  });

  it('places several repeats without stacking them on each other', () => {
    const long = [...queue, ...entries('c.t1.k04', 'a.t2.k03', 'b.t1.k02', 'c.t1.k05')];
    const result = placeRepeats(
      long,
      [scheduleRepeat(0, 'a.t1.k01'), scheduleRepeat(1, 'b.t2.k01')],
      describeEntry,
    );
    expect(result.waiting).toEqual([]);
    const positions = result.entries.flatMap((entry, index) =>
      entry.source === 'repeat' ? [index] : [],
    );
    expect(positions).toHaveLength(2);
    expect(new Set(positions).size).toBe(2);
    const steps = result.entries.map(describeEntry).filter((step) => step !== undefined);
    expect(orderViolations(steps)).toEqual({ category: false, topic: false, heavy: false });
  });
});
