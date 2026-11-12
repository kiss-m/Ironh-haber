import { useNavigate } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { Button } from '../../components/ui/Button.tsx';
import { sk } from '../../i18n/sk.ts';
import { useSettings } from '../settings/useSettings.ts';
import type { StretchStats } from './session.ts';
import { useDaily } from './useDaily.ts';

interface CheckpointProps {
  /** Which stretch of ten this closes, counting from 1. */
  batch: number;
  stats: StretchStats | undefined;
  onContinue: () => void;
}

/** A row of the figures: a label and its value. */
export function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-display text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The natural pause after every ten cards: what the stretch brought, where the day stands, and
 * an honest choice between going on and stopping.
 */
export function Checkpoint({ batch, stats, onContinue }: CheckpointProps) {
  const navigate = useNavigate();
  const settings = useSettings();
  const daily = useDaily();
  const goalReached = stats?.goalReached ?? false;
  const titles = stats?.newTitles ?? [];

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-5 overflow-y-auto px-gutter pt-[calc(env(safe-area-inset-top)+3.75rem)] pb-5">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-accent-fg uppercase">
          {sk.checkpoint.kicker(batch)}
        </p>
        <h2 className="font-display text-3xl font-bold tracking-tight text-balance">
          {goalReached ? sk.checkpoint.goalTitle : sk.checkpoint.title}
        </h2>
        {goalReached ? <p className="text-pretty">{sk.checkpoint.goalBody}</p> : null}
      </header>

      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
        <Figure label={sk.checkpoint.xp} value={sk.feed.xp(stats?.xp ?? 0)} />
        <Figure label={sk.checkpoint.newCards} value={String(titles.length)} />
        {stats && stats.answers > 0 ? (
          <Figure
            label={sk.checkpoint.accuracy}
            value={sk.checkpoint.accuracyValue(stats.correct, stats.answers)}
          />
        ) : null}
        <Figure
          label={sk.checkpoint.today}
          value={sk.checkpoint.todayValue(daily?.cardsSeen ?? 0, settings.dailyGoal)}
        />
      </dl>

      {titles.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-widest text-muted uppercase">
            {sk.checkpoint.learned}
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {titles.map((title) => (
              <li key={title} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent"
                />
                {title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button onClick={onContinue}>{sk.checkpoint.continue}</Button>
        <Button
          variant="quiet"
          onClick={() => {
            void navigate(PATHS.done);
          }}
        >
          {sk.checkpoint.stop}
        </Button>
      </div>
    </div>
  );
}
