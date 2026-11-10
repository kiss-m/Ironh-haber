import { Moon, Sun, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { useThemeStore } from '../../app/theme.ts';
import type { ThemeName } from '../../data/types.ts';
import { sk } from '../../i18n/sk.ts';

const OPTIONS: readonly { value: ThemeName; label: string; icon: LucideIcon }[] = [
  { value: 'dark', label: sk.theme.dark, icon: Moon },
  { value: 'light', label: sk.theme.light, icon: Sun },
];

/** Picks the dark or the light theme. */
export function ThemeSwitch() {
  const labelId = useId();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span id={labelId} className="font-semibold">
        {sk.theme.label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex max-w-full flex-wrap rounded-2xl border border-line bg-surface p-1"
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setTheme(value);
              }}
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
                selected ? 'bg-accent text-on-accent' : 'text-muted'
              }`}
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
