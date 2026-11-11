import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { findCategory } from '../../../shared/taxonomy.ts';
import { useThemeStore } from '../../app/theme.ts';
import { BrandMark } from '../../components/ui/BrandMark.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { DAILY_GOALS, DEFAULT_CATEGORY_WEIGHT, DEFAULT_DAILY_GOAL } from '../../core/config.ts';
import { loadContentIndex } from '../../data/content.ts';
import { db } from '../../data/db.ts';
import { createProfile } from '../../data/profile.ts';
import { requestPersistence } from '../../data/storage.ts';
import { sk } from '../../i18n/sk.ts';
import { CategoryPicker } from '../settings/CategoryPicker.tsx';
import { GoalPicker } from '../settings/GoalPicker.tsx';
import { WeightSliders } from '../settings/WeightSliders.tsx';

const STEPS = ['name', 'categories', 'weights', 'goal'] as const;
const NAME_MAX_LENGTH = 24;

/**
 * First start: name the character, pick categories, weigh them, choose the daily goal. Finishing
 * creates the profile, and the gate in Root.tsx then opens the feed.
 */
export function OnboardingScreen() {
  const headingId = useId();
  const errorId = useId();
  const categories = useLiveQuery(async () => (await loadContentIndex(db)).categories);

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  // Null until the reader changes the selection. Until then the starter set applies.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [goal, setGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const step = STEPS[stepIndex] ?? 'name';
  const starters = (categories ?? [])
    .filter((category) => findCategory(category.id)?.starter ?? true)
    .map((category) => category.id);
  const selected = chosen ?? starters;
  const copy = sk.onboarding[step];

  async function finish(): Promise<void> {
    setSaving(true);
    await createProfile(
      db,
      {
        name,
        categoryWeights: Object.fromEntries(
          selected.map((id) => [id, weights[id] ?? DEFAULT_CATEGORY_WEIGHT]),
        ),
        dailyGoal: goal,
        theme: useThemeStore.getState().theme,
      },
      new Date(),
    );
    // Asked once the reader has something worth keeping. Settings shows the answer.
    void requestPersistence();
  }

  function next(): void {
    if (step === 'name' && name.trim() === '') {
      setError(sk.onboarding.name.missing);
      return;
    }
    if (step === 'categories' && selected.length === 0) {
      setError(sk.onboarding.categories.missing);
      return;
    }
    setError(null);
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else void finish();
  }

  function back(): void {
    setError(null);
    setStepIndex(Math.max(0, stepIndex - 1));
  }

  return (
    <form
      noValidate
      aria-labelledby={headingId}
      onSubmit={(event) => {
        event.preventDefault();
        next();
      }}
      className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <BrandMark className="h-8 w-auto" />
          <span className="text-xs font-semibold tracking-widest text-muted uppercase">
            {sk.onboarding.step(stepIndex + 1, STEPS.length)}
          </span>
        </div>
        <div aria-hidden="true" className="flex gap-1.5">
          {STEPS.map((id, index) => (
            <span
              key={id}
              className={`h-1 flex-1 rounded-full ${index <= stepIndex ? 'bg-accent' : 'bg-raised'}`}
            />
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1
            id={headingId}
            className="font-display text-3xl font-bold tracking-tight text-balance"
          >
            {copy.title}
          </h1>
          <p className="text-pretty text-muted">{copy.hint}</p>
        </div>

        {step === 'name' ? (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{sk.onboarding.name.label}</span>
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="off"
              enterKeyHint="next"
              aria-invalid={error !== null}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              className="min-h-14 rounded-2xl border border-line bg-surface px-4 font-display text-xl font-semibold"
            />
          </label>
        ) : null}

        {step === 'categories' ? (
          <CategoryPicker
            categories={categories ?? []}
            selected={selected}
            onChange={(ids) => {
              setChosen(ids);
              setError(null);
            }}
          />
        ) : null}

        {step === 'weights' ? (
          <WeightSliders
            categories={(categories ?? []).filter((category) => selected.includes(category.id))}
            weights={weights}
            onChange={(id, weight) => {
              setWeights({ ...weights, [id]: weight });
            }}
          />
        ) : null}

        {step === 'goal' ? (
          <GoalPicker goals={DAILY_GOALS} value={goal} onChange={setGoal} />
        ) : null}

        {error ? (
          <p id={errorId} role="alert" className="font-semibold text-bad">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="flex gap-3">
        {stepIndex > 0 ? (
          <Button variant="quiet" onClick={back} disabled={saving}>
            {sk.onboarding.back}
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={saving}>
          {stepIndex === STEPS.length - 1 ? sk.onboarding.finish : sk.onboarding.next}
        </Button>
      </footer>
    </form>
  );
}
