import { Moon, Sun } from 'lucide-react';
import { useId } from 'react';
import { useThemeStore } from '../../app/theme.ts';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { sk } from '../../i18n/sk.ts';

const OPTIONS = [
  { value: 'dark', label: sk.theme.dark, icon: Moon },
  { value: 'light', label: sk.theme.light, icon: Sun },
] as const;

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
      <SegmentedControl labelledBy={labelId} options={OPTIONS} value={theme} onChange={setTheme} />
    </div>
  );
}
