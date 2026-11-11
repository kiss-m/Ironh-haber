import { Atom, Bot, Lightbulb, Shapes, type LucideIcon } from 'lucide-react';

/**
 * The icons a pack may name in `category.icon`. Importing them one by one keeps the rest of the
 * icon set out of the bundle. A name that is not listed falls back to a neutral icon.
 */
const ICONS: Record<string, LucideIcon> = {
  atom: Atom,
  bot: Bot,
  lightbulb: Lightbulb,
};

interface CategoryIconProps {
  name: string;
  className?: string;
}

export function CategoryIcon({ name, className }: CategoryIconProps) {
  const Icon = ICONS[name] ?? Shapes;
  return <Icon aria-hidden="true" className={className} />;
}
