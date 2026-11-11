import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Screen } from '../../components/ui/Screen.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { Toggle } from '../../components/ui/Toggle.tsx';
import { DAILY_GOALS, DEFAULT_CATEGORY_WEIGHT } from '../../core/config.ts';
import { loadContentIndex } from '../../data/content.ts';
import { db } from '../../data/db.ts';
import { updateSettings } from '../../data/profile.ts';
import { isPersisted, requestPersistence } from '../../data/storage.ts';
import { sk } from '../../i18n/sk.ts';
import { AppStatus } from './AppStatus.tsx';
import { CategoryPicker } from './CategoryPicker.tsx';
import { GoalPicker } from './GoalPicker.tsx';
import { ThemeSwitch } from './ThemeSwitch.tsx';
import { useSettings } from './useSettings.ts';
import { WeightSliders } from './WeightSliders.tsx';

const NEW_CARD_CAPS = [20, 40, 60].map((value) => ({ value, label: String(value) }));
const RETENTIONS = [0.85, 0.9, 0.95].map((value) => ({
  value,
  label: sk.settings.retentionValue(value),
}));
const NAME_MAX_LENGTH = 24;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-xs font-semibold tracking-widest text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A labelled choice between a few values, with a line about what it does. */
function Choice<T extends string | number>(props: {
  label: string;
  hint: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span id={labelId} className="font-semibold">
          {props.label}
        </span>
        <span className="text-sm text-pretty text-muted">{props.hint}</span>
      </div>
      <SegmentedControl
        labelledBy={labelId}
        options={props.options}
        value={props.value}
        onChange={props.onChange}
      />
    </div>
  );
}

/** Whether the browser protects the data from eviction, with a way to ask for it. */
function StorageStatus() {
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void isPersisted().then((value) => {
      if (!cancelled) setPersisted(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (persisted === undefined) return null;
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-pretty">
        {persisted === true
          ? sk.settings.storagePersisted
          : persisted === false
            ? sk.settings.storageNotPersisted
            : sk.settings.storageUnknown}
      </p>
      {persisted === false ? (
        <Button
          variant="quiet"
          className="border border-line"
          onClick={() => {
            void requestPersistence().then((granted) => {
              setPersisted(granted ?? false);
            });
          }}
        >
          {sk.settings.storageRequest}
        </Button>
      ) : null}
    </div>
  );
}

/** Everything the reader can tune. Each change is saved at once. */
export function SettingsScreen() {
  const settings = useSettings();
  const character = useLiveQuery(() => db.character.get('me'));
  const categories = useLiveQuery(async () => (await loadContentIndex(db)).categories) ?? [];
  const nameId = useId();

  const selected = categories
    .map((category) => category.id)
    .filter((id) => (settings.categoryWeights[id] ?? 0) > 0);

  function selectCategories(ids: string[]): void {
    // A feed needs something to draw from, so the last category cannot be switched off.
    if (ids.length === 0) return;
    void updateSettings(db, {
      categoryWeights: Object.fromEntries(
        ids.map((id) => [id, settings.categoryWeights[id] ?? DEFAULT_CATEGORY_WEIGHT]),
      ),
    });
  }

  return (
    <Screen>
      <header className="flex items-center gap-2">
        <Link
          to={PATHS.character}
          aria-label={sk.settings.back}
          className="-ml-3 flex size-12 items-center justify-center rounded-xl text-muted"
        >
          <ArrowLeft aria-hidden="true" className="size-6" />
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">{sk.settings.title}</h1>
      </header>

      <Section title={sk.settings.character}>
        <label className="flex flex-col gap-2" htmlFor={nameId}>
          <span className="font-semibold">{sk.settings.name}</span>
          <input
            id={nameId}
            type="text"
            key={character?.name}
            defaultValue={character?.name ?? ''}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            onBlur={(event) => {
              const name = event.target.value.trim();
              if (name !== '' && name !== character?.name) void db.character.update('me', { name });
              else event.target.value = character?.name ?? '';
            }}
            className="min-h-12 rounded-2xl border border-line bg-surface px-4 font-semibold"
          />
        </label>
      </Section>

      <Section title={sk.settings.goal}>
        <GoalPicker
          goals={DAILY_GOALS}
          value={settings.dailyGoal}
          onChange={(dailyGoal) => void updateSettings(db, { dailyGoal })}
        />
      </Section>

      <Section title={sk.settings.categories}>
        <p className="text-sm text-pretty text-muted">{sk.settings.categoriesHint}</p>
        <CategoryPicker categories={categories} selected={selected} onChange={selectCategories} />
      </Section>

      <Section title={sk.settings.weights}>
        <WeightSliders
          categories={categories.filter((category) => selected.includes(category.id))}
          weights={settings.categoryWeights}
          onChange={(id, weight) =>
            void updateSettings(db, {
              categoryWeights: { ...settings.categoryWeights, [id]: weight },
            })
          }
        />
      </Section>

      <Section title={sk.settings.learning}>
        <Choice
          label={sk.settings.newCardCap}
          hint={sk.settings.newCardCapHint}
          options={NEW_CARD_CAPS}
          value={settings.newCardCap}
          onChange={(newCardCap) => void updateSettings(db, { newCardCap })}
        />
        <Choice
          label={sk.settings.retention}
          hint={sk.settings.retentionHint}
          options={RETENTIONS}
          value={settings.desiredRetention}
          onChange={(desiredRetention) => void updateSettings(db, { desiredRetention })}
        />
        <Toggle
          label={sk.settings.serendipity}
          hint={sk.settings.serendipityHint}
          checked={settings.serendipity}
          onChange={(serendipity) => void updateSettings(db, { serendipity })}
        />
        <Toggle
          label={sk.settings.germanTerms}
          hint={sk.settings.germanTermsHint}
          checked={settings.showGermanTerms}
          onChange={(showGermanTerms) => void updateSettings(db, { showGermanTerms })}
        />
      </Section>

      <Section title={sk.settings.appearance}>
        <ThemeSwitch />
      </Section>

      <Section title={sk.settings.storage}>
        <StorageStatus />
      </Section>

      <AppStatus />
    </Screen>
  );
}
