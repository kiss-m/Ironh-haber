import { useLiveQuery } from 'dexie-react-hooks';
import { Settings } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { ATTRIBUTE_CODES } from '../../../shared/taxonomy.ts';
import { PATHS } from '../../app/paths.ts';
import { ATTRIBUTE_SWATCH } from '../../components/ui/attributes.ts';
import { Screen } from '../../components/ui/Screen.tsx';
import { attributeProgress, characterProgress, rankForLevel } from '../../core/character.ts';
import { db } from '../../data/db.ts';
import { sk } from '../../i18n/sk.ts';

/** A thin bar: how far along a level is. */
function Bar({ share, className }: { share: number; className: string }) {
  return (
    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-raised">
      <div
        className={`h-full rounded-full ${className}`}
        style={{ width: `${Math.round(Math.min(1, share) * 100)}%` }}
      />
    </div>
  );
}

/**
 * The character: level, rank and the six attributes. Phase 3 adds the class, sharpness, quests,
 * achievements and statistics.
 */
export function CharacterScreen() {
  const attributesId = useId();
  const comingId = useId();
  const character = useLiveQuery(() => db.character.get('me'));
  const total = characterProgress(character?.totalXp ?? 0);

  return (
    <Screen>
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate font-display text-3xl font-bold tracking-tight">
            {character?.name ?? sk.character.title}
          </h1>
          <p className="text-muted">
            {sk.character.level(total.level)} · {sk.ranks[rankForLevel(total.level)]}
          </p>
        </div>
        <Link
          to={PATHS.settings}
          aria-label={sk.character.settings}
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-raised text-muted"
        >
          <Settings aria-hidden="true" className="size-6" />
        </Link>
      </header>

      <div className="flex flex-col gap-2">
        <Bar share={total.intoLevel / total.levelSize} className="bg-accent" />
        <p className="flex justify-between text-sm text-muted">
          <span>{sk.character.xpLabel}</span>
          <span className="tabular-nums">{sk.character.xp(total.intoLevel, total.levelSize)}</span>
        </p>
      </div>

      <section aria-labelledby={attributesId} className="flex flex-col gap-3">
        <h2
          id={attributesId}
          className="text-xs font-semibold tracking-widest text-muted uppercase"
        >
          {sk.character.attributesHeading}
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
          {ATTRIBUTE_CODES.map((code) => {
            const progress = attributeProgress(character?.attributeXp[code] ?? 0);
            return (
              <li
                key={code}
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg font-bold">{sk.attributes[code]}</span>
                  <span className="text-sm text-muted tabular-nums">
                    {sk.character.attributeLevel(progress.level)}
                  </span>
                </span>
                <Bar
                  share={progress.intoLevel / progress.levelSize}
                  className={ATTRIBUTE_SWATCH[code]}
                />
                <span className="text-sm text-pretty text-muted">{sk.attributeDomains[code]}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby={comingId} className="flex flex-col gap-3">
        <h2 id={comingId} className="text-xs font-semibold tracking-widest text-muted uppercase">
          {sk.common.comingHeading} · {sk.common.phase(3)}
        </h2>
        <ul className="flex flex-col gap-2 text-sm text-muted">
          {sk.character.items.map((item) => (
            <li key={item} className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent"
              />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </Screen>
  );
}
