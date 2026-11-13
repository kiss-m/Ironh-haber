import { describe, expect, it } from 'vitest';
import { addLearningDays, learningDay, learningDayStart, nextLearningDayStart } from './day.ts';

const HOUR = 60 * 60 * 1000;

/** Tests give instants in UTC and expect Europe/Prague local time (set in vite.config.ts). */
function utc(iso: string): Date {
  return new Date(`${iso}Z`);
}

describe('test environment', () => {
  it('runs in the Europe/Prague time zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Prague');
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-60);
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(-120);
  });
});

describe('learningDay', () => {
  it('starts a new day at 04:00 local time, not at midnight', () => {
    // Winter: local time is UTC+1.
    expect(learningDay(utc('2026-11-10T02:59:59'))).toBe('2026-11-09'); // 03:59:59
    expect(learningDay(utc('2026-11-10T03:00:00'))).toBe('2026-11-10'); // 04:00:00
    expect(learningDay(utc('2026-11-10T11:00:00'))).toBe('2026-11-10'); // noon
    expect(learningDay(utc('2026-11-10T22:59:59'))).toBe('2026-11-10'); // 23:59:59
  });

  it('counts learning after midnight toward the previous day', () => {
    expect(learningDay(utc('2026-11-10T23:00:00'))).toBe('2026-11-10'); // 00:00 on the 11th
    expect(learningDay(utc('2026-11-11T01:30:00'))).toBe('2026-11-10'); // 02:30 on the 11th
  });

  it('crosses month and year boundaries', () => {
    expect(learningDay(utc('2026-02-28T23:30:00'))).toBe('2026-02-28'); // 00:30 on 1 March
    expect(learningDay(utc('2026-12-31T23:30:00'))).toBe('2026-12-31'); // 00:30 on 1 January
    expect(learningDay(utc('2027-01-01T02:59:00'))).toBe('2026-12-31'); // 03:59 on 1 January
    expect(learningDay(utc('2027-01-01T03:00:00'))).toBe('2027-01-01');
    expect(learningDay(utc('2028-02-29T12:00:00'))).toBe('2028-02-29'); // leap day
    expect(learningDay(utc('2028-02-29T23:30:00'))).toBe('2028-02-29'); // 00:30 on 1 March
  });

  describe('when the clocks go forward (29 March 2026, 02:00 → 03:00)', () => {
    it('keeps the night before the change in the previous day', () => {
      expect(learningDay(utc('2026-03-28T23:30:00'))).toBe('2026-03-28'); // 00:30 CET
      expect(learningDay(utc('2026-03-29T00:59:59'))).toBe('2026-03-28'); // 01:59:59 CET
      expect(learningDay(utc('2026-03-29T01:00:00'))).toBe('2026-03-28'); // 03:00 CEST
      expect(learningDay(utc('2026-03-29T01:59:59'))).toBe('2026-03-28'); // 03:59:59 CEST
    });

    it('starts the new day at 04:00 summer time', () => {
      expect(learningDay(utc('2026-03-29T02:00:00'))).toBe('2026-03-29'); // 04:00 CEST
      expect(learningDayStart('2026-03-29').toISOString()).toBe('2026-03-29T02:00:00.000Z');
    });

    it('makes the learning day before the change 23 hours long', () => {
      const start = learningDayStart('2026-03-28');
      const end = learningDayStart('2026-03-29');
      expect(start.toISOString()).toBe('2026-03-28T03:00:00.000Z');
      expect((end.getTime() - start.getTime()) / HOUR).toBe(23);
    });
  });

  describe('when the clocks go back (25 October 2026, 03:00 → 02:00)', () => {
    it('keeps both passes through 02:30 in the previous day', () => {
      expect(learningDay(utc('2026-10-25T00:30:00'))).toBe('2026-10-24'); // 02:30 CEST
      expect(learningDay(utc('2026-10-25T01:30:00'))).toBe('2026-10-24'); // 02:30 CET
      expect(learningDay(utc('2026-10-25T02:59:59'))).toBe('2026-10-24'); // 03:59:59 CET
    });

    it('starts the new day at 04:00 winter time', () => {
      expect(learningDay(utc('2026-10-25T03:00:00'))).toBe('2026-10-25'); // 04:00 CET
      expect(learningDayStart('2026-10-25').toISOString()).toBe('2026-10-25T03:00:00.000Z');
    });

    it('makes the learning day before the change 25 hours long', () => {
      const start = learningDayStart('2026-10-24');
      const end = learningDayStart('2026-10-25');
      expect(start.toISOString()).toBe('2026-10-24T02:00:00.000Z');
      expect((end.getTime() - start.getTime()) / HOUR).toBe(25);
    });
  });
});

describe('learningDayStart', () => {
  it('is 04:00 local time and belongs to its own day', () => {
    for (const day of ['2026-01-01', '2026-03-29', '2026-07-15', '2026-10-25', '2026-12-31']) {
      const start = learningDayStart(day);
      expect(start.getHours(), day).toBe(4);
      expect(start.getMinutes(), day).toBe(0);
      expect(learningDay(start), day).toBe(day);
      expect(learningDay(new Date(start.getTime() - 1)), day).toBe(addLearningDays(day, -1));
    }
  });
});

describe('addLearningDays', () => {
  it('steps over month ends, year ends and leap days', () => {
    expect(addLearningDays('2026-11-10', 1)).toBe('2026-11-11');
    expect(addLearningDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addLearningDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addLearningDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addLearningDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addLearningDays('2026-11-10', 0)).toBe('2026-11-10');
    expect(addLearningDays('2026-11-10', 365)).toBe('2027-11-10');
  });

  it('is not thrown off by a daylight-saving change in between', () => {
    expect(addLearningDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addLearningDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addLearningDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addLearningDays('2026-10-24', 2)).toBe('2026-10-26');
  });
});

describe('nextLearningDayStart', () => {
  it('is the coming 04:00, whether it is evening or already past midnight', () => {
    expect(nextLearningDayStart(utc('2026-11-10T19:00:00')).toISOString()).toBe(
      '2026-11-11T03:00:00.000Z',
    );
    expect(nextLearningDayStart(utc('2026-11-11T01:30:00')).toISOString()).toBe(
      '2026-11-11T03:00:00.000Z',
    );
    expect(nextLearningDayStart(utc('2026-11-11T03:00:00')).toISOString()).toBe(
      '2026-11-12T03:00:00.000Z',
    );
  });

  it('lands on 04:00 local time across both daylight-saving changes', () => {
    // Evening before the spring change: the next day starts at 04:00 CEST = 02:00 UTC.
    expect(nextLearningDayStart(utc('2026-03-28T20:00:00')).toISOString()).toBe(
      '2026-03-29T02:00:00.000Z',
    );
    // Evening before the autumn change: the next day starts at 04:00 CET = 03:00 UTC.
    expect(nextLearningDayStart(utc('2026-10-24T20:00:00')).toISOString()).toBe(
      '2026-10-25T03:00:00.000Z',
    );
  });
});
