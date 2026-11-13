import { Gem } from 'lucide-react';
import { ComingSoon } from '../../components/ui/ComingSoon.tsx';
import { sk } from '../../i18n/sk.ts';

/** Phase 0 placeholder. Phase 3 builds the collection of mastered cards. */
export function CollectionScreen() {
  return (
    <ComingSoon
      icon={Gem}
      title={sk.collection.title}
      lead={sk.collection.lead}
      items={sk.collection.items}
      phase={3}
    />
  );
}
