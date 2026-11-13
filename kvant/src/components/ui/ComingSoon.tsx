import type { LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { sk } from '../../i18n/sk.ts';
import { Screen } from './Screen.tsx';

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  lead: string;
  items: readonly string[];
  /** The build phase that delivers this screen. */
  phase: number;
  children?: ReactNode;
}

/** A placeholder for a screen that a later phase builds: what it is and what it will hold. */
export function ComingSoon({ icon: Icon, title, lead, items, phase, children }: ComingSoonProps) {
  const headingId = useId();

  return (
    <Screen>
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-raised text-accent-fg">
            <Icon aria-hidden="true" className="size-6" />
          </span>
          <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold tracking-widest whitespace-nowrap text-muted uppercase">
            {sk.common.phase(phase)}
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-pretty">{lead}</p>
      </header>

      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h2 id={headingId} className="text-xs font-semibold tracking-widest text-muted uppercase">
          {sk.common.comingHeading}
        </h2>
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item}
              className="flex gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-pretty"
            >
              <span
                aria-hidden="true"
                className="mt-[0.6em] size-2 shrink-0 rounded-full bg-accent"
              />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {children}
    </Screen>
  );
}
