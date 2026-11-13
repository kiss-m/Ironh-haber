/**
 * The learning day (docs/SPEC.md section 7): from 04:00 to 04:00 local time. Everything "daily"
 * (goal, new-card cap, due reviews, streaks) is counted per learning day, never per calendar day.
 *
 * Local time means the time zone of the device. The functions read it through the local getters
 * of `Date`, so they stay correct across daylight-saving changes, when a learning day lasts 23 or
 * 25 hours.
 */
import { DAY_START_HOUR } from './config.ts';

/** A learning day as `YYYY-MM-DD`. Sorts chronologically as a plain string. */
export type LearningDay = string;

function format(year: number, month: number, day: number): LearningDay {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${mm}-${dd}`;
}

function parts(day: LearningDay): [year: number, month: number, date: number] {
  const [year = Number.NaN, month = Number.NaN, date = Number.NaN] = day.split('-').map(Number);
  return [year, month, date];
}

/** The learning day that `now` belongs to. Before 04:00 that is still yesterday's. */
export function learningDay(now: Date): LearningDay {
  const beforeStart = now.getHours() < DAY_START_HOUR;
  // Date normalises day 0 to the last day of the previous month.
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (beforeStart ? 1 : 0));
  return format(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** The moment a learning day begins: 04:00 local time on its date. */
export function learningDayStart(day: LearningDay): Date {
  const [year, month, date] = parts(day);
  return new Date(year, month - 1, date, DAY_START_HOUR);
}

/** The learning day `count` days after `day` (or before it, for a negative count). */
export function addLearningDays(day: LearningDay, count: number): LearningDay {
  const [year, month, date] = parts(day);
  const shifted = new Date(year, month - 1, date + count);
  return format(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate());
}

/** The moment the learning day after `now`'s begins. */
export function nextLearningDayStart(now: Date): Date {
  return learningDayStart(addLearningDays(learningDay(now), 1));
}
