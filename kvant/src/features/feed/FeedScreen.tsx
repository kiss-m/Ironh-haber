import { useEffect, useRef } from 'react';
import { sk } from '../../i18n/sk.ts';
import { CardPage } from './CardPage.tsx';
import { Checkpoint } from './Checkpoint.tsx';
import { EndPage } from './EndPage.tsx';
import { FeedStatus } from './FeedStatus.tsx';
import { Pager, type PagerHandle } from './Pager.tsx';
import { LevelUp, XpFloat } from './Rewards.tsx';
import { feedSession as session } from './session.ts';

/** The feed: one card per screen, swipe up for the next, a checkpoint after every ten. */
export function FeedScreen() {
  const state = session.useStore();
  const pager = useRef<PagerHandle>(null);

  useEffect(() => {
    session.attach();
    return () => {
      session.detach();
    };
  }, []);

  if (state.status !== 'ready') {
    return (
      <div role="status" className="flex h-full items-center justify-center text-muted">
        {sk.feed.loading}
      </div>
    );
  }

  const pages = session.pages(state);
  const advance = () => pager.current?.goTo(state.pageIndex + 1);

  return (
    <div className="relative h-full">
      <h1 className="sr-only">{sk.nav.feed}</h1>
      <FeedStatus />
      <XpFloat reward={state.reward} />
      <Pager
        ref={pager}
        label={sk.feed.label}
        count={pages.length}
        index={state.pageIndex}
        onIndexChange={session.setPage}
        renderPage={(index) => {
          const page = pages[index];
          if (!page) return null;
          if (page.kind === 'card') {
            return (
              <CardPage
                session={session}
                entry={page.entry}
                entryIndex={page.entryIndex}
                onAdvance={advance}
              />
            );
          }
          if (page.kind === 'checkpoint') {
            return (
              <Checkpoint
                batch={page.batch}
                stats={state.stats[page.batch - 1]}
                onContinue={advance}
              />
            );
          }
          return <EndPage />;
        }}
      />
      <LevelUp level={state.levelUp} onClose={session.dismissLevelUp} />
    </div>
  );
}
