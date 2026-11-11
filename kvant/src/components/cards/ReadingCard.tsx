import type { Card } from '../../../shared/schema.ts';
import { sk } from '../../i18n/sk.ts';
import { Formula } from './Formula.tsx';
import { Callout, CardText, CardTitle, TermsLine } from './parts.tsx';

interface ReadingCardProps {
  card: Card;
  showGermanTerms: boolean;
  /** "Nerozumiem" was tapped: show the simpler wording, if the card has one. */
  notUnderstood?: boolean;
}

/**
 * A card as it is read: concept, formula, example or did-you-know. Quiz and myth cards have
 * their own components, because the reader answers them.
 */
export function ReadingCard({ card, showGermanTerms, notUnderstood = false }: ReadingCardProps) {
  return (
    <div className="flex flex-col gap-4">
      <CardTitle>{card.title}</CardTitle>

      {card.type === 'formula' ? (
        <>
          <div className="overflow-x-auto rounded-2xl bg-surface px-4 py-3 text-xl">
            <Formula latex={card.latex} display />
          </div>
          <dl aria-label={sk.cards.legend} className="flex flex-col gap-1 text-sm">
            {card.legend.map((entry) => (
              <div key={entry.symbol} className="flex items-baseline gap-3">
                <dt className="w-10 shrink-0 text-base">
                  <Formula latex={entry.symbol} />
                </dt>
                <dd className="text-pretty">
                  {entry.meaning}
                  {entry.unit ? <span className="text-muted"> · {entry.unit}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
          <CardText>{card.body}</CardText>
          <p className="text-sm text-pretty text-muted">
            <span className="mr-1.5 text-xs font-semibold tracking-widest uppercase">
              {sk.cards.example}
            </span>
            {card.example}
          </p>
        </>
      ) : null}

      {card.type === 'concept' || card.type === 'example' || card.type === 'did_you_know' ? (
        <CardText>{card.body}</CardText>
      ) : null}

      {notUnderstood ? (
        <Callout label={card.type === 'concept' ? sk.cards.simple : undefined}>
          {card.type === 'concept' ? <p>{card.simple}</p> : null}
          <p className="text-sm text-muted">{sk.cards.willReturn}</p>
        </Callout>
      ) : null}

      {'terms' in card ? <TermsLine terms={card.terms} showGerman={showGermanTerms} /> : null}
    </div>
  );
}
