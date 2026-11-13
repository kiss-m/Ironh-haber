import type { LucideIcon } from 'lucide-react';

interface Option<T extends string | number> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string | number> {
  /** The id of the element that names the group. */
  labelledBy: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A small set of exclusive choices, shown side by side. */
export function SegmentedControl<T extends string | number>({
  labelledBy,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex max-w-full flex-wrap rounded-2xl border border-line bg-surface p-1"
    >
      {options.map(({ value: option, label, icon: Icon }) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onChange(option);
            }}
            className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
              selected ? 'bg-accent text-on-accent' : 'text-muted'
            }`}
          >
            {Icon ? <Icon aria-hidden="true" className="size-5" /> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
