import { useNavigate } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { Button } from '../../components/ui/Button.tsx';
import { sk } from '../../i18n/sk.ts';
import { useSettings } from '../settings/useSettings.ts';
import { useDaily } from './useDaily.ts';

/** The last page of the feed, when there is nothing more to learn right now. */
export function EndPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const daily = useDaily();
  const capReached = (daily?.newCards ?? 0) >= settings.newCardCap;

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center gap-4 px-5">
      <h2 className="font-display text-3xl font-bold tracking-tight text-balance">
        {sk.end.title}
      </h2>
      <p className="text-pretty text-muted">{capReached ? sk.end.capBody : sk.end.emptyBody}</p>
      <Button
        className="self-start"
        onClick={() => {
          void navigate(PATHS.done);
        }}
      >
        {sk.end.summary}
      </Button>
    </div>
  );
}
