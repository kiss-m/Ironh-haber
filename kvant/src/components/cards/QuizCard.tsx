import { Check, X } from 'lucide-react';
import { sk } from '../../i18n/sk.ts';
import { Callout, CardQuestion } from './parts.tsx';
import { useReveal } from './useReveal.ts';

interface QuizCardProps {
  question: string;
  options: readonly string[];
  correctIndex: number;
  explanation: string;
  /** The option the reader picked, or null while the question is open. */
  chosen: number | null;
  onAnswer: (index: number) => void;
}

/** A multiple-choice question. Once answered it shows the right option and why. */
export function QuizCard({
  question,
  options,
  correctIndex,
  explanation,
  chosen,
  onAnswer,
}: QuizCardProps) {
  const answered = chosen !== null;
  const correct = chosen === correctIndex;
  const verdict = useReveal<HTMLDivElement>(answered);

  return (
    <div className="flex flex-col gap-4">
      <CardQuestion>{question}</CardQuestion>

      <ul className="flex flex-col gap-2.5">
        {options.map((option, index) => {
          const isCorrect = index === correctIndex;
          const isChosen = index === chosen;
          const state = !answered
            ? 'border-line bg-surface'
            : isCorrect
              ? 'border-good bg-surface'
              : isChosen
                ? 'border-bad bg-surface'
                : 'border-line opacity-60';
          return (
            <li key={option}>
              <button
                type="button"
                disabled={answered}
                aria-pressed={answered ? isChosen : undefined}
                onClick={() => {
                  onAnswer(index);
                }}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-transform active:scale-[0.98] ${state}`}
              >
                <span className="flex-1 text-pretty">{option}</span>
                {answered && isCorrect ? (
                  <Check aria-hidden="true" className="size-5 shrink-0 text-good" />
                ) : null}
                {answered && isChosen && !isCorrect ? (
                  <X aria-hidden="true" className="size-5 shrink-0 text-bad" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {answered ? (
        <div ref={verdict} role="status">
          <Callout
            tone={correct ? 'good' : 'bad'}
            label={correct ? sk.cards.answerCorrect : sk.cards.answerWrong}
          >
            {explanation}
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
