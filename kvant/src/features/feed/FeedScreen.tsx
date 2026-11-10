import { BrandMark } from '../../components/ui/BrandMark.tsx';
import { EnergyLevels } from '../../components/ui/EnergyLevels.tsx';
import { Screen } from '../../components/ui/Screen.tsx';
import { sk } from '../../i18n/sk.ts';
import { AppStatus } from '../settings/AppStatus.tsx';

/** Phase 0 placeholder. Phase 1 replaces it with the vertical card pager. */
export function FeedScreen() {
  return (
    <Screen>
      <header className="flex items-center gap-3">
        <BrandMark className="h-9 w-auto" />
        <div className="flex flex-col">
          <span className="font-display text-xl leading-none font-bold tracking-tight">
            {sk.app.name}
          </span>
          <span className="text-xs text-muted">{sk.app.tagline}</span>
        </div>
      </header>

      <EnergyLevels />

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold tracking-widest text-accent-fg uppercase">
          {sk.feed.kicker}
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-balance">
          {sk.feed.heading}
        </h1>
        <p className="text-pretty">{sk.feed.body}</p>
      </div>

      <AppStatus />
    </Screen>
  );
}
