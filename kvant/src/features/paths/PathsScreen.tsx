import { Route } from 'lucide-react';
import { ComingSoon } from '../../components/ui/ComingSoon.tsx';
import { sk } from '../../i18n/sk.ts';

/** Phase 0 placeholder. Phase 4 builds the skill-tree paths and their bosses. */
export function PathsScreen() {
  return (
    <ComingSoon
      icon={Route}
      title={sk.paths.title}
      lead={sk.paths.lead}
      items={sk.paths.items}
      phase={4}
    />
  );
}
