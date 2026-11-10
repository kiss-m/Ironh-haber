import { GalleryVerticalEnd, Gem, Route, UserRound, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { NavLink } from 'react-router';
import { sk } from '../i18n/sk.ts';
import { PATHS } from './paths.ts';

const TABS: readonly { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: PATHS.feed, label: sk.nav.feed, icon: GalleryVerticalEnd, end: true },
  { to: PATHS.paths, label: sk.nav.paths, icon: Route },
  { to: PATHS.collection, label: sk.nav.collection, icon: Gem },
  { to: PATHS.character, label: sk.nav.character, icon: UserRound },
];

/**
 * The four main screens. The amber quantum slides to the active tab.
 *
 * The bar is the one place where sizes stop growing with the system font size: four labels have
 * to share the screen width, so label, icon and height are capped relative to the viewport.
 * Without the cap a 200 % font scale truncates the labels and the bar takes a fifth of the screen.
 */
export function TabBar() {
  return (
    <nav
      aria-label={sk.nav.label}
      className="border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex min-h-[min(4rem,18vw)] flex-col items-center justify-center gap-1 px-1 pt-2.5 pb-2 text-[min(0.8125rem,4.2vw)] leading-tight font-semibold transition-colors ${
                  isActive ? 'text-accent-fg' : 'text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <motion.span
                      layoutId="tab-quantum"
                      aria-hidden="true"
                      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                      className="absolute -top-1 size-2 rounded-full bg-accent shadow-[0_0_0.75rem_0.125rem] shadow-accent/50"
                    />
                  ) : null}
                  <Icon
                    aria-hidden="true"
                    className="size-[min(1.5rem,8vw)]"
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                  <span className="max-w-full truncate">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
