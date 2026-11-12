import type { FlashcardButton } from '../../core/srs.ts';
import { sk } from '../../i18n/sk.ts';
import { Button } from '../ui/Button.tsx';
import { Callout, CardQuestion } from './parts.tsx';
import { useReveal } from './useReveal.ts';

interface FlashcardProps {
  question: string;
  answer: string;
  revealed: boolean;
  /** The grade the reader gave, or null while it is still open. */
  grade: FlashcardButton | null;
  onReveal: () => void;
  onGrade: (grade: FlashcardButton) => void;
}

const GRADES: readonly FlashcardButton[] = ['again', 'hard', 'good', 'easy'];

/**
 * A review without a quiz: the recall question first, then the answer and four buttons with
 * which the reader grades how well it went.
 */
export function Flashcard({
  question,
  answer,
  revealed,
  grade,
  onReveal,
  onGrade,
}: FlashcardProps) {
  // The answer and the grade buttons under it belong together, so both are brought into view.
  const back = useReveal<HTMLDivElement>(revealed);

  return (
    <div className="flex flex-col gap-4">
      <CardQuestion>{question}</CardQuestion>

      {revealed ? (
        <div ref={back} className="flex flex-col gap-4">
          <div role="status">
            <Callout label={sk.cards.flashcard.answer}>{answer}</Callout>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{sk.cards.flashcard.prompt}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {GRADES.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={grade !== null}
                  aria-pressed={grade === null ? undefined : grade === value}
                  onClick={() => {
                    onGrade(value);
                  }}
                  className={`min-h-12 rounded-xl border-2 px-3 text-sm font-semibold transition-transform active:scale-95 ${
                    grade === value
                      ? 'border-accent bg-accent text-on-accent'
                      : grade === null
                        ? 'border-line bg-surface'
                        : 'border-line opacity-50'
                  }`}
                >
                  {sk.cards.flashcard[value]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <Button className="self-start" onClick={onReveal}>
          {sk.cards.flashcard.reveal}
        </Button>
      )}
    </div>
  );
}
