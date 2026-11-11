import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Screen } from '../../components/ui/Screen.tsx';
import { learningDay, nextLearningDayStart } from '../../core/day.ts';
import { db } from '../../data/db.ts';
import { sk } from '../../i18n/sk.ts';
import { Figure } from './Checkpoint.tsx';

/** "Na dnes stačí": a calm look at what today brought, and nothing that pulls the reader back. */
export function DoneScreen() {
  const navigate = useNavigate();
  const daily = useLiveQuery(() => db.daily.get(learningDay(new Date())));
  const tomorrow = useLiveQuery(() =>
    db.cardState.where('srs.due').belowOrEqual(nextLearningDayStart(new Date()).getTime()).count(),
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <Screen>
        <header className="flex flex-col gap-2 pt-6">
          <h1 className="font-display text-4xl font-bold tracking-tight text-balance">
            {sk.done.title}
          </h1>
          <p className="text-pretty text-muted">{sk.done.body}</p>
        </header>

        <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
          <Figure label={sk.done.cards} value={String(daily?.cardsSeen ?? 0)} />
          <Figure label={sk.done.newCards} value={String(daily?.newCards ?? 0)} />
          {daily && daily.answers > 0 ? (
            <Figure
              label={sk.done.accuracy}
              value={sk.checkpoint.accuracyValue(daily.correct, daily.answers)}
            />
          ) : null}
          <Figure label={sk.done.xp} value={sk.feed.xp(daily?.xp ?? 0)} />
          <Figure
            label={sk.done.minutes}
            value={String(Math.round((daily?.activeSeconds ?? 0) / 60))}
          />
        </dl>

        {tomorrow !== undefined ? (
          <p className="text-pretty">{sk.done.tomorrow(tomorrow)}</p>
        ) : null}

        <Button
          variant="quiet"
          className="mt-auto self-start"
          onClick={() => {
            void navigate(PATHS.feed);
          }}
        >
          {sk.done.back}
        </Button>
      </Screen>
    </div>
  );
}
