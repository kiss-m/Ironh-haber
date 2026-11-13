import { useLiveQuery } from 'dexie-react-hooks';
import { Check, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { useLearningDay } from '../../app/useLearningDay.ts';
import { characterProgress } from '../../core/character.ts';
import { db } from '../../data/db.ts';
import { sk } from '../../i18n/sk.ts';
import { useSettings } from '../settings/useSettings.ts';
import { useDaily } from './useDaily.ts';

const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** How many reviews are due right now. Cards become due when a learning day starts. */
export function useDueCount(): number {
  const day = useLearningDay();
  return (
    useLiveQuery(() => db.cardState.where('srs.due').belowOrEqual(Date.now()).count(), [day]) ?? 0
  );
}

/**
 * The status in the corner of the feed: progress toward the daily goal, the character level,
 * and the number of due reviews, which opens a review session.
 */
export function FeedStatus() {
  const settings = useSettings();
  const daily = useDaily();
  const character = useLiveQuery(() => db.character.get('me'));
  const due = useDueCount();

  const seen = daily?.cardsSeen ?? 0;
  const goal = settings.dailyGoal;
  const done = seen >= goal;
  const share = Math.min(1, seen / goal);
  const level = characterProgress(character?.totalXp ?? 0).level;

  return (
    <div className="top-row pointer-events-none absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-4 z-10 flex h-10 items-center gap-2">
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
        // The chip is 40 px high. The link around it gives the finger its 48.
        <Link
          to={PATHS.review}
          aria-label={sk.feed.due(due)}
          className="pointer-events-auto flex min-h-[48px] min-w-[48px] items-center justify-end"
        >
          <span className="flex h-10 items-center gap-1 rounded-xl bg-accent px-2.5 text-xs font-bold text-on-accent tabular-nums">
            <RotateCcw aria-hidden="true" className="size-4" />
            {due}
          </span>
        </Link>
      ) : null}
    </div>
  );
}
