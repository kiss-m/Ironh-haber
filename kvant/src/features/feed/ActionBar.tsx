import type { LucideIcon } from 'lucide-react';
import { sk } from '../../i18n/sk.ts';

export interface CardAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** For actions that stay on, such as a like or a bookmark. */
  pressed?: boolean;
  onClick: () => void;
}

/**
 * The actions under a card. Like the tab bar, it is capped against the system font size: five
 * labelled buttons have to fit across a 360 px screen.
 */
export function ActionBar({ actions }: { actions: readonly CardAction[] }) {
  return (
    <div role="group" aria-label={sk.actions.label} className="flex justify-between gap-1">
      {actions.map(({ id, label, icon: Icon, pressed, onClick }) => (
        <button
          key={id}
          type="button"
          aria-pressed={pressed}
          onClick={onClick}
          className={`flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[min(0.6875rem,3.2vw)] leading-tight font-semibold transition-transform active:scale-90 ${
            pressed ? 'text-accent-fg' : 'text-muted'
          }`}
        >
          <Icon
            aria-hidden="true"
            className="size-[min(1.375rem,6.5vw)]"
            fill={pressed ? 'currentColor' : 'none'}
          />
          {label}
        </button>
      ))}
    </div>
  );
}
