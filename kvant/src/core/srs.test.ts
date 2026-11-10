import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { addLearningDays, learningDay } from './day.ts';
import {
  GRADE,
  SRS_STATE,
  gradeForAnswer,
  gradeForFlashcard,
  isCorrectGrade,
  isDue,
  isMastered,
  isReviewed,
  newSchedule,
  retrievability,
  review,
  sharpness,
  type Grade,
  type SrsRecord,
} from './srs.ts';

const DAY = 24 * 60 * 60 * 1000;

/** Tests give instants in UTC and expect Europe/Prague local time (set in vite.config.ts). */
function utc(iso: string): Date {
  return new Date(`${iso}Z`);
}

const { again: AGAIN, hard: HARD, good: GOOD, easy: EASY } = GRADE;
const ALL_GRADES = [AGAIN, HARD, GOOD, EASY];

/** 19:00 local time on a winter evening. */
const EVENING = utc('2026-11-10T18:00:00');

/** Rates a card on the day it falls due, again and again. Returns every schedule on the way. */
function life(grades: Grade[], start: Date = EVENING): SrsRecord[] {
  const history = [newSchedule(start)];
  for (const grade of grades) {
    const current = history[history.length - 1]!;
    // Review in the evening of the due day.
    history.push(review(current, grade, new Date(current.due + 15 * 60 * 60 * 1000)));
  }
  return history;
}

function last(records: SrsRecord[]): SrsRecord {
  return records[records.length - 1]!;
}

describe('grade mapping', () => {
  it('grades a wrong answer Again, however fast or slow', () => {
    expect(gradeForAnswer(false, 500)).toBe(GRADE.again);
    expect(gradeForAnswer(false, 60_000)).toBe(GRADE.again);
  });

  it('grades a correct answer Good', () => {
    expect(gradeForAnswer(true, 0)).toBe(GRADE.good);
    expect(gradeForAnswer(true, 4_000)).toBe(GRADE.good);
  });

  it('grades a correct answer slower than 20 s Hard', () => {
    expect(gradeForAnswer(true, 20_000)).toBe(GRADE.good);
    expect(gradeForAnswer(true, 20_001)).toBe(GRADE.hard);
    expect(gradeForAnswer(true, 90_000)).toBe(GRADE.hard);
  });

  it('maps the flashcard buttons Nevedel, Ťažké, Vedel, Ľahké to Again, Hard, Good, Easy', () => {
    expect(gradeForFlashcard('again')).toBe(1);
    expect(gradeForFlashcard('hard')).toBe(2);
    expect(gradeForFlashcard('good')).toBe(3);
    expect(gradeForFlashcard('easy')).toBe(4);
  });

  it('counts everything except Again as a correct answer', () => {
    expect(isCorrectGrade(GRADE.again)).toBe(false);
    expect(isCorrectGrade(GRADE.hard)).toBe(true);
    expect(isCorrectGrade(GRADE.good)).toBe(true);
    expect(isCorrectGrade(GRADE.easy)).toBe(true);
  });
});

describe('first exposure', () => {
  it('is not a review: no rating, no stability', () => {
    const record = newSchedule(EVENING);
    expect(record.reps).toBe(0);
    expect(record.state).toBe(SRS_STATE.new);
    expect(record.lastReview).toBeNull();
    expect(isReviewed(record)).toBe(false);
    expect(retrievability(record, EVENING)).toBe(0);
  });

  it('is due when the next learning day starts', () => {
    const record = newSchedule(EVENING); // 19:00 on 10 November
    expect(new Date(record.due).toISOString()).toBe('2026-11-11T03:00:00.000Z'); // 04:00
    expect(isDue(record, EVENING)).toBe(false);
    expect(isDue(record, utc('2026-11-11T02:59:59'))).toBe(false);
    expect(isDue(record, utc('2026-11-11T03:00:00'))).toBe(true);
  });

  it('read after midnight is still due at the coming 04:00', () => {
    const record = newSchedule(utc('2026-11-11T00:30:00')); // 01:30, learning day 10 November
    expect(new Date(record.due).toISOString()).toBe('2026-11-11T03:00:00.000Z');
  });
});

describe('review', () => {
  it('turns the first rating into an interval of whole days', () => {
    const fresh = newSchedule(EVENING);
    const nextDay = utc('2026-11-11T18:00:00');
    const days = ALL_GRADES.map((grade) => review(fresh, grade, nextDay).scheduledDays);
    // Again comes back tomorrow, and every better grade waits longer than the one before.
    expect(days[0]).toBe(1);
    expect(days[AGAIN]).toBeGreaterThan(days[0]!);
    expect(days[HARD]).toBeGreaterThan(days[AGAIN]!);
    expect(days[GOOD]).toBeGreaterThan(days[HARD]!);
  });

  it('records the rating', () => {
    const rated = review(newSchedule(EVENING), GRADE.good, utc('2026-11-11T18:00:00'));
    expect(rated.reps).toBe(1);
    expect(rated.state).toBe(SRS_STATE.review);
    expect(rated.lastReview).toBe(utc('2026-11-11T18:00:00').getTime());
    expect(isReviewed(rated)).toBe(true);
  });

  it('applies Easy on first sight for "Už viem"', () => {
    const known = review(newSchedule(EVENING), GRADE.easy, EVENING);
    expect(known.state).toBe(SRS_STATE.review);
    expect(known.scheduledDays).toBeGreaterThanOrEqual(7);
    expect(learningDay(new Date(known.due)) > '2026-11-16').toBe(true);
  });

  it('makes a card due at 04:00 of a learning day, whatever the hour of the review', () => {
    const fresh = newSchedule(EVENING);
    const morning = review(fresh, GRADE.again, utc('2026-11-11T05:00:00')); // 06:00
    const night = review(fresh, GRADE.again, utc('2026-11-11T22:30:00')); // 23:30
    const afterMidnight = review(fresh, GRADE.again, utc('2026-11-12T01:00:00')); // 02:00 on the 12th
    for (const rated of [morning, night, afterMidnight]) {
      expect(rated.scheduledDays).toBe(1);
      expect(new Date(rated.due).toISOString()).toBe('2026-11-12T03:00:00.000Z');
    }
  });

  it('counts the interval in learning days across the autumn clock change', () => {
    // 04:10 summer time on 24 October. Exactly 24 hours later it is 03:10 winter time, which
    // still belongs to the same learning day, so the due day must not be read off the clock.
    const justAfterStart = utc('2026-10-24T02:10:00');
    const rated = review(newSchedule(utc('2026-10-23T18:00:00')), GRADE.again, justAfterStart);
    expect(rated.scheduledDays).toBe(1);
    expect(new Date(rated.due).toISOString()).toBe('2026-10-25T03:00:00.000Z'); // 04:00 CET
    expect(isDue(rated, justAfterStart)).toBe(false);
  });

  it('counts the interval in learning days across the spring clock change', () => {
    const rated = review(
      newSchedule(utc('2026-03-27T18:00:00')),
      GRADE.again,
      utc('2026-03-28T18:00:00'),
    );
    expect(new Date(rated.due).toISOString()).toBe('2026-03-29T02:00:00.000Z'); // 04:00 CEST
  });

  it('lengthens the interval with every Good', () => {
    const intervals = life([GOOD, GOOD, GOOD, GOOD, GOOD])
      .slice(1)
      .map((record) => record.scheduledDays);
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]!);
    }
  });

  it('shortens the interval after a lapse and counts it', () => {
    const history = life([GOOD, GOOD, GOOD, AGAIN]);
    const before = history[GOOD]!;
    const lapsed = last(history);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.scheduledDays).toBeLessThan(before.scheduledDays);
    expect(lapsed.stability).toBeLessThan(before.stability);
  });

  it('never schedules further than 365 days ahead', () => {
    for (const grades of [
      [EASY, EASY, EASY, EASY, EASY, EASY, EASY, EASY],
      [GOOD, GOOD, GOOD, GOOD, GOOD, GOOD, GOOD, GOOD, GOOD, GOOD, GOOD, GOOD],
    ] as Grade[][]) {
      const longest = Math.max(...life(grades).map((record) => record.scheduledDays));
      // The fuzz may land a little under the cap, never over it.
      expect(longest).toBeLessThanOrEqual(365);
      expect(longest).toBeGreaterThan(330);
    }
  });

  it('puts the due day exactly `scheduledDays` learning days after the review', () => {
    for (const record of life([GOOD, HARD, EASY, AGAIN, GOOD, GOOD, EASY]).slice(1)) {
      const reviewedOn = learningDay(new Date(record.lastReview!));
      expect(learningDay(new Date(record.due))).toBe(
        addLearningDays(reviewedOn, record.scheduledDays),
      );
      expect(new Date(record.due).getHours()).toBe(4);
    }
  });

  it('schedules sooner for a higher desired retention', () => {
    const base = last(life([GOOD, GOOD]));
    const at = (retention: number) =>
      review(base, GRADE.good, new Date(base.due + 12 * 60 * 60 * 1000), retention).scheduledDays;
    expect(at(0.95)).toBeLessThan(at(0.9));
    expect(at(0.9)).toBeLessThan(at(0.85));
  });

  it('clamps the desired retention to 0.85–0.95', () => {
    const base = last(life([GOOD, GOOD]));
    const when = new Date(base.due + 12 * 60 * 60 * 1000);
    expect(review(base, GRADE.good, when, 0.99)).toEqual(review(base, GRADE.good, when, 0.95));
    expect(review(base, GRADE.good, when, 0.5)).toEqual(review(base, GRADE.good, when, 0.85));
  });

  it('is deterministic', () => {
    expect(life([GOOD, HARD, EASY, AGAIN, GOOD])).toEqual(life([GOOD, HARD, EASY, AGAIN, GOOD]));
  });

  it('matches ts-fsrs run directly with the same parameters', () => {
    const direct = fsrs(
      generatorParameters({
        request_retention: 0.9,
        maximum_interval: 365,
        enable_fuzz: true,
        enable_short_term: false,
      }),
    );
    const first = utc('2026-11-11T18:00:00');
    const second = utc('2026-11-14T18:00:00');
    const directFirst = direct.next(createEmptyCard(EVENING), first, Rating.Good).card;
    const directSecond = direct.next(directFirst, second, Rating.Good).card;

    const ours = review(review(newSchedule(EVENING), GRADE.good, first), GRADE.good, second);

    // Stored records drop the deprecated elapsed_days field. The result must not depend on it.
    expect(ours.stability).toBe(directSecond.stability);
    expect(ours.difficulty).toBe(directSecond.difficulty);
    expect(ours.scheduledDays).toBe(directSecond.scheduled_days);
    expect(ours.reps).toBe(2);
  });
});

describe('mastery', () => {
  it('needs a stability of at least 21 days', () => {
    const history = life([GOOD, GOOD, GOOD, GOOD]);
    const firstMastered = history.findIndex(isMastered);
    expect(firstMastered).toBeGreaterThan(1);
    expect(history[firstMastered]!.stability).toBeGreaterThanOrEqual(21);
    expect(history[firstMastered - 1]!.stability).toBeLessThan(21);
  });

  it('is never reached by only reading a card', () => {
    expect(isMastered(newSchedule(EVENING))).toBe(false);
  });
});

describe('retrievability and sharpness', () => {
  const rated = last(life([GOOD, GOOD]));
  const reviewedAt = new Date(rated.lastReview!);

  it('is close to 1 right after a review and decays with time', () => {
    const now = retrievability(rated, reviewedAt);
    const atDue = retrievability(rated, new Date(rated.due));
    const muchLater = retrievability(rated, new Date(rated.due + 60 * DAY));
    expect(now).toBeGreaterThan(0.99);
    expect(atDue).toBeGreaterThan(0.85);
    expect(atDue).toBeLessThan(0.95);
    expect(muchLater).toBeLessThan(atDue);
    expect(muchLater).toBeGreaterThan(0);
  });

  it('has no sharpness before the first rating', () => {
    expect(sharpness([], EVENING)).toBeNull();
    expect(sharpness([newSchedule(EVENING)], EVENING)).toBeNull();
  });

  it('averages the retrievability of rated cards and ignores unrated ones', () => {
    const other = last(life([AGAIN]));
    const when = new Date(rated.due);
    const expected = (retrievability(rated, when) + retrievability(other, when)) / 2;
    expect(sharpness([rated, other, newSchedule(EVENING)], when)).toBeCloseTo(expected, 10);
  });

  it('drops as reviews are left waiting, below the 70 % "rusting" line after a long neglect', () => {
    const fresh = sharpness([rated], reviewedAt)!;
    const aSeason = sharpness([rated], new Date(rated.due + 90 * DAY))!;
    const aYear = sharpness([rated], new Date(rated.due + 365 * DAY))!;
    expect(aSeason).toBeLessThan(fresh);
    expect(aYear).toBeLessThan(aSeason);
    expect(aYear).toBeLessThan(0.7);
  });
});
