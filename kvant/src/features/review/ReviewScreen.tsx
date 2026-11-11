import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { Button } from '../../components/ui/Button.tsx';
import { sk } from '../../i18n/sk.ts';
import { CardPage } from '../feed/CardPage.tsx';
import { Figure } from '../feed/Checkpoint.tsx';
import { useDueCount } from '../feed/FeedStatus.tsx';
import { Pager, type PagerHandle } from '../feed/Pager.tsx';
import { LevelUp, XpFloat } from '../feed/Rewards.tsx';
import { reviewSession as session } from '../feed/session.ts';

/**
 * A review session: due cards only, as a quiz or a flashcard, closed by a summary. It is the
 * pressure valve of the feed, which serves only a few retrievals per batch.
 */
export function ReviewScreen() {
  const state = session.useStore();
  const pager = useRef<PagerHandle>(null);
  const navigate = useNavigate();
  const stillDue = useDueCount();

  // Every visit starts a new session from whatever is due at that moment.
  useEffect(() => {
    session.reset();
    session.attach();
    return () => {
      session.detach();
    };
  }, []);

  const total = state.entries.length;
  const stats = state.stats[0];

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col">
      <header className="flex items-center justify-between gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <Link
          to={PATHS.feed}
          aria-label={sk.review.close}
          className="flex size-12 items-center justify-center rounded-xl text-muted"
        >
          <X aria-hidden="true" className="size-6" />
        </Link>
        <h1 className="font-display text-lg font-bold">{sk.review.title}</h1>
        <span className="w-12 text-right text-xs font-semibold text-muted tabular-nums">
          {state.status === 'ready' && total > 0
            ? sk.review.progress(Math.min(state.pageIndex + 1, total), total)
            : null}
        </span>
      </header>

      {state.status !== 'ready' ? (
        <div role="status" className="flex flex-1 items-center justify-center text-muted">
          {sk.review.loading}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <XpFloat reward={state.reward} />
          <Pager
            ref={pager}
            label={sk.review.label}
            count={total + 1}
            index={state.pageIndex}
            onIndexChange={session.setPage}
            renderPage={(index) => {
              const entry = state.entries[index];
              if (entry) {
                return (
                  <CardPage
                    session={session}
                    entry={entry}
                    entryIndex={index}
                    onAdvance={() => pager.current?.goTo(index + 1)}
                  />
                );
              }
              return (
                <div className="flex h-full flex-col justify-center gap-5 px-5">
                  <h2 className="font-display text-3xl font-bold tracking-tight text-balance">
                    {total === 0 ? sk.review.emptyTitle : sk.review.doneTitle}
                  </h2>
                  {total === 0 ? (
                    <p className="text-pretty text-muted">{sk.review.emptyBody}</p>
                  ) : (
                    <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
                      <Figure label={sk.review.answered} value={String(stats?.answers ?? 0)} />
                      {stats && stats.answers > 0 ? (
                        <Figure
                          label={sk.review.accuracy}
                          value={sk.checkpoint.accuracyValue(stats.correct, stats.answers)}
                        />
                      ) : null}
                      <Figure label={sk.review.xp} value={sk.feed.xp(stats?.xp ?? 0)} />
                    </dl>
                  )}
                  {total > 0 && stillDue > 0 ? (
                    <p className="text-pretty">{sk.review.remaining(stillDue)}</p>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    {total > 0 && stillDue > 0 ? (
                      <Button
                        onClick={() => {
                          session.reset();
                        }}
                      >
                        {sk.review.more}
                      </Button>
                    ) : null}
                    <Button
                      variant={total > 0 && stillDue > 0 ? 'quiet' : 'primary'}
                      onClick={() => {
                        void navigate(PATHS.feed);
                      }}
                    >
                      {sk.review.back}
                    </Button>
                  </div>
                </div>
              );
            }}
          />
          <LevelUp level={state.levelUp} onClose={session.dismissLevelUp} />
        </div>
      )}
    </div>
  );
}
