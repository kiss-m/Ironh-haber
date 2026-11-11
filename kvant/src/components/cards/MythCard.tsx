import { sk } from '../../i18n/sk.ts';
import { Callout } from './parts.tsx';

interface MythCardProps {
  statement: string;
  isTrue: boolean;
  explanation: string;
  /** The reader's verdict: true for "Pravda", false for "Mýtus", null while still open. */
  verdict: boolean | null;
  onAnswer: (verdict: boolean) => void;
}

/** A statement to judge as true or as a myth. */
export function MythCard({ statement, isTrue, explanation, verdict, onAnswer }: MythCardProps) {
  const answered = verdict !== null;
  const correct = verdict === isTrue;

  const choice = (value: boolean, label: string) => {
    const isAnswer = value === isTrue;
    const state = !answered
      ? 'border-line bg-surface'
      : isAnswer
        ? 'border-good bg-surface'
        : value === verdict
          ? 'border-bad bg-surface'
          : 'border-line opacity-60';
    return (
      <button
        type="button"
        disabled={answered}
        aria-pressed={answered ? value === verdict : undefined}
        onClick={() => {
          onAnswer(value);
        }}
        className={`min-h-14 flex-1 rounded-2xl border-2 px-4 py-3 font-display text-lg font-bold transition-transform active:scale-[0.98] ${state}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs font-semibold tracking-widest text-muted uppercase">
        {sk.cards.myth.prompt}
      </p>
      <h2 className="font-display text-2xl leading-snug font-bold tracking-tight text-balance">
        „{statement.replace(/\.$/, '')}.“
      </h2>

      <div className="flex gap-3">
        {choice(true, sk.cards.myth.isTrue)}
        {choice(false, sk.cards.myth.isMyth)}
      </div>

      {answered ? (
        <div role="status">
          <Callout
            tone={correct ? 'good' : 'bad'}
            label={`${correct ? sk.cards.answerCorrect : sk.cards.answerWrong} · ${
              isTrue ? sk.cards.myth.verdictTrue : sk.cards.myth.verdictMyth
            }`}
          >
            {explanation}
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
