import { DEFAULT_CATEGORY_WEIGHT } from '../../core/config.ts';
import type { CategoryRow } from '../../data/types.ts';
import { sk } from '../../i18n/sk.ts';

interface WeightSlidersProps {
  categories: readonly CategoryRow[];
  /** categoryId → weight. A category without an entry has the default weight. */
  weights: Readonly<Record<string, number>>;
  onChange: (categoryId: string, weight: number) => void;
}

/** One slider per selected category: how often it shows up in the feed. */
export function WeightSliders({ categories, weights, onChange }: WeightSlidersProps) {
  return (
    <div className="flex flex-col gap-4">
      {categories.map((category) => {
        const weight = weights[category.id] ?? DEFAULT_CATEGORY_WEIGHT;
        return (
          <label key={category.id} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{category.name}</span>
              <span className="text-sm text-muted">{sk.weight(weight)}</span>
            </span>
            <input
              type="range"
              min={10}
              max={100}
              step={10}
              value={weight}
              aria-valuetext={sk.weight(weight)}
              onChange={(event) => {
                onChange(category.id, Number(event.target.value));
              }}
              className="h-12 w-full accent-(--kv-accent)"
            />
          </label>
        );
      })}
    </div>
  );
}
