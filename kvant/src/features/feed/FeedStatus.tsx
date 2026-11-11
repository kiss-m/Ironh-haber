import { useLiveQuery } from 'dexie-react-hooks';
import { Check, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { characterProgress } from '../../core/character.ts';
import { learningDay } from '../../core/day.ts';
import { db } from '../../data/db.ts';
import { sk } from '../../i18n/sk.ts';
import { useSettings } from '../settings/useSettings.ts';

const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** How many reviews are due right now. */
export function useDueCount(): number {
  return useLiveQuery(() => db.cardState.where('srs.due').belowOrEqual(Date.now()).count()) ?? 0;
}

/**
 * The status in the corner of the feed: progress toward the daily goal, the character level,
 * and the number of due reviews, which opens a review session.
 */
export function FeedStatus() {
  const settings = useSettings();
  const daily = useLiveQuery(() => db.daily.get(learningDay(new Date())));
  const character = useLiveQuery(() => db.character.get('me'));
  const due = useDueCount();

  const seen = daily?.cardsSeen ?? 0;
  const goal = settings.dailyGoal;
  const done = seen >= goal;
  const share = Math.min(1, seen / goal);
  const level = characterProgress(character?.totalXp ?? 0).level;

  return (
    <div className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-4 z-10 flex h-10 items-center gap-2">
      <div
        role="img"
        aria-label={done ? sk.feed.goalMet : sk.feed.goal(seen, goal)}
        className="flex items-center gap-1.5 text-xs font-semibold tabular-nums"
      >
        <svg viewBox="0 0 32 32" className="size-8 -rotate-90">
          <circle
            cx="16"
            cy="16"
            r={RADIUS}
            fill="none"
            strokeWidth="4"
            className="stroke-raised"
          />
          <circle
            cx="16"
            cy="16"
            r={RADIUS}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - share)}
            className="stroke-accent transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        {done ? (
          <Check aria-hidden="true" className="size-4 text-accent-fg" />
        ) : (
          <span aria-hidden="true">
            {seen}/{goal}
          </span>
        )}
      </div>

      <span
        aria-label={sk.feed.level(level)}
        className="flex size-8 items-center justify-center rounded-xl bg-raised font-display text-sm font-bold tabular-nums"
      >
        {level}
      </span>

      {due > 0 ? (
        <Link
          to={PATHS.review}
          aria-label={sk.feed.due(due)}
          className="pointer-events-auto flex h-10 items-center gap-1 rounded-xl bg-accent px-2.5 text-xs font-bold text-on-accent tabular-nums"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          {due}
        </Link>
      ) : null}
    </div>
  );
}
