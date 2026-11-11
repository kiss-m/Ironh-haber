import type { ReactNode } from 'react';
import type { Terms } from '../../../shared/schema.ts';
import { sk } from '../../i18n/sk.ts';

/** The title of a card. */
export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-2xl leading-tight font-bold tracking-tight text-balance">
      {children}
    </h2>
  );
}

/** The running text of a card: 18 px at the default font size. */
export function CardText({ children }: { children: ReactNode }) {
  return <p className="text-pretty">{children}</p>;
}

interface TermsLineProps {
  terms: Terms | undefined;
  /** The German term is shown only when the setting is on. */
  showGerman: boolean;
}

/** The English and German names of a technical term. */
export function TermsLine({ terms, showGerman }: TermsLineProps) {
  const english = terms?.en;
  const german = showGerman ? terms?.de : undefined;
  if (!english && !german) return null;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {english ? (
        <span>
          <span className="mr-1.5 text-xs font-semibold tracking-widest">{sk.cards.termEn}</span>
          <span lang="en">{english}</span>
        </span>
      ) : null}
      {german ? (
        <span>
          <span className="mr-1.5 text-xs font-semibold tracking-widest">{sk.cards.termDe}</span>
          <span lang="de">{german}</span>
        </span>
      ) : null}
    </p>
  );
}

/** A tinted box for something set apart from the card's text: a hint, an answer, a verdict. */
export function Callout({
  label,
  tone = 'accent',
  children,
}: {
  label?: string;
  tone?: 'accent' | 'good' | 'bad';
  children: ReactNode;
}) {
  const colour =
    tone === 'good'
      ? 'border-good text-good'
      : tone === 'bad'
        ? 'border-bad text-bad'
        : 'border-accent text-accent-fg';
  return (
    <div className={`rounded-2xl border-l-4 bg-surface px-4 py-3 ${colour}`}>
      {label ? <p className="text-xs font-semibold tracking-widest uppercase">{label}</p> : null}
      <div className="text-pretty text-fg">{children}</div>
    </div>
  );
}
