import { UserRound } from 'lucide-react';
import { useId } from 'react';
import { ATTRIBUTE_CODES, type AttributeCode } from '../../../shared/taxonomy.ts';
import { ComingSoon } from '../../components/ui/ComingSoon.tsx';
import { sk } from '../../i18n/sk.ts';
import { ThemeSwitch } from '../settings/ThemeSwitch.tsx';

/** Tailwind needs complete class names, so the attribute colours are spelled out here. */
const ATTRIBUTE_SWATCH: Record<AttributeCode, string> = {
  T: 'bg-attr-t',
  R: 'bg-attr-r',
  B: 'bg-attr-b',
  M: 'bg-attr-m',
  W: 'bg-attr-w',
  J: 'bg-attr-j',
};

/**
 * Phase 0 placeholder. Phase 3 builds the character sheet. The theme switch lives here only
 * until the Settings screen exists.
 */
export function CharacterScreen() {
  const attributesId = useId();

  return (
    <ComingSoon
      icon={UserRound}
      title={sk.character.title}
      lead={sk.character.lead}
      items={sk.character.items}
      phase={3}
    >
      <section aria-labelledby={attributesId} className="flex flex-col gap-3">
        <h2
          id={attributesId}
          className="text-xs font-semibold tracking-widest text-muted uppercase"
        >
          {sk.character.attributesHeading}
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
          {ATTRIBUTE_CODES.map((code) => (
            <li
              key={code}
              className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3"
            >
              <span className="flex items-center gap-2 font-display text-lg font-bold">
                <span
                  aria-hidden="true"
                  className={`size-3 shrink-0 rounded-full ${ATTRIBUTE_SWATCH[code]}`}
                />
                {sk.attributes[code]}
              </span>
              <span className="text-sm text-pretty text-muted">{sk.attributeDomains[code]}</span>
            </li>
          ))}
        </ul>
      </section>

      <ThemeSwitch />
    </ComingSoon>
  );
}
