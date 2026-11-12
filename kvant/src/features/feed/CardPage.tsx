import { useLiveQuery } from 'dexie-react-hooks';
import { Bookmark, CheckCheck, CircleHelp, Flag, ThumbsUp } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Flashcard } from '../../components/cards/Flashcard.tsx';
import { MythCard } from '../../components/cards/MythCard.tsx';
import { QuizCard } from '../../components/cards/QuizCard.tsx';
import { ReadingCard } from '../../components/cards/ReadingCard.tsx';
import { useReveal } from '../../components/cards/useReveal.ts';
import { isAnsweredOnSight, quizOf, reviewForm } from '../../core/cards.ts';
import { isRetrieval, type FeedEntry } from '../../core/mixer.ts';
import { db } from '../../data/db.ts';
import type { CardRow } from '../../data/types.ts';
import { sk } from '../../i18n/sk.ts';
import { useSettings } from '../settings/useSettings.ts';
import { ActionBar, type CardAction } from './ActionBar.tsx';
import { FlagSheet } from './FlagSheet.tsx';
import { EMPTY_PAGE, type Session } from './session.ts';

interface CardPageProps {
  session: Session;
  entry: FeedEntry;
  entryIndex: number;
  /** Moves to the next page, for actions that are done with the card. */
  onAdvance: () => void;
}

/** How a card is presented on this showing. */
type Form = 'reading' | 'quiz' | 'myth' | 'flashcard';

function formOf(card: CardRow, entry: FeedEntry): Form {
  if (isRetrieval(entry.source)) return reviewForm(card);
  if (!isAnsweredOnSight(card)) return 'reading';
  return card.type === 'myth' ? 'myth' : 'quiz';
}

/** One card of a session, full screen: what it is, the card itself, and the actions under it. */
export function CardPage({ session, entry, entryIndex, onAdvance }: CardPageProps) {
  const page = session.useStore((state) => state.pages[entryIndex]) ?? EMPTY_PAGE;
  // `undefined` while loading, `null` when the card is gone.
  const card = useLiveQuery(async () => (await db.cards.get(entry.cardId)) ?? null, [entry.cardId]);
  const category = useLiveQuery(
    () => (card ? db.categories.get(card.categoryId) : undefined),
    [card?.categoryId],
  );
  const cardState = useLiveQuery(() => db.cardState.get(entry.cardId), [entry.cardId]);
  const settings = useSettings();
  const [flagOpen, setFlagOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const fullCard = useReveal<HTMLDivElement>(showFull);

  if (!card) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-muted">
        {card === null ? sk.cards.missing : sk.cards.loading}
      </div>
    );
  }

  const form = formOf(card, entry);
  const retrieval = isRetrieval(entry.source);
  const quiz = quizOf(card);
  const answered = page.correct !== null;
  const flagged = cardState?.flagged ?? null;

  const actions: CardAction[] = [
    {
      id: 'like',
      label: sk.actions.like,
      icon: ThumbsUp,
      pressed: cardState?.liked ?? false,
      onClick: () => void session.like(entryIndex, !(cardState?.liked ?? false)),
    },
    {
      id: 'bookmark',
      label: sk.actions.bookmark,
      icon: Bookmark,
      pressed: cardState?.bookmarked ?? false,
      onClick: () => void session.bookmark(entryIndex, !(cardState?.bookmarked ?? false)),
    },
    // "Už viem" and "Nerozumiem" are about reading a card, so questions do not offer them.
    ...(form === 'reading'
      ? [
          {
            id: 'known',
            label: sk.actions.known,
            icon: CheckCheck,
            pressed: cardState?.known ?? false,
            onClick: () => {
              void session.known(entryIndex);
              onAdvance();
            },
          },
          {
            id: 'notUnderstood',
            label: sk.actions.notUnderstood,
            icon: CircleHelp,
            pressed: page.notUnderstood,
            onClick: () => void session.notUnderstood(entryIndex),
          },
        ]
      : []),
    {
      id: 'flag',
      label: sk.actions.flag,
      icon: Flag,
      pressed: flagged !== null,
      onClick: () => {
        setFlagOpen(true);
      },
    },
  ];

  const badge = entry.source === 'new' ? null : sk.cards.source[entry.source];
  // The category colour, used by the dot and the glow behind the card.
  const accent: CSSProperties & Record<'--cat', string> = {
    '--cat': category?.color ?? 'transparent',
  };

  return (
    <article
      aria-label={card.title}
      style={accent}
      className="flex h-full flex-col bg-[radial-gradient(110%_55%_at_0%_0%,color-mix(in_oklab,var(--cat)_16%,transparent),transparent_70%)] px-gutter pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2"
    >
      {/* The right side of this row belongs to the status corner of the screen. Category names
          run to almost thirty letters, so the name may take two lines rather than be cut. */}
      <header className="top-row flex min-h-10 items-center gap-2 pr-44">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-(--cat)" />
        <span className="line-clamp-2 text-xs leading-tight font-semibold text-muted">
          {category?.name}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth">
        <div className="flex shrink-0 grow flex-col gap-4 pt-3 pb-6">
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-widest uppercase">
            <span className="text-accent-fg">{sk.cards.type[card.type]}</span>
            {badge ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-muted">
                {badge}
              </span>
            ) : null}
          </p>

          {form === 'reading' ? (
            <ReadingCard
              card={card}
              showGermanTerms={settings.showGermanTerms}
              notUnderstood={page.notUnderstood}
            />
          ) : null}

          {form === 'quiz' && quiz ? (
            <QuizCard
              question={quiz.question}
              options={quiz.options}
              correctIndex={quiz.correctIndex}
              explanation={quiz.explanation}
              chosen={page.choice}
              onAnswer={(choice) => void session.answerQuiz(entryIndex, choice)}
            />
          ) : null}

          {form === 'myth' && card.type === 'myth' ? (
            <MythCard
              statement={card.statement}
              isTrue={card.isTrue}
              explanation={card.explanation}
              verdict={page.verdict}
              onAnswer={(verdict) => void session.answerMyth(entryIndex, verdict)}
            />
          ) : null}

          {form === 'flashcard' && 'recall' in card ? (
            <Flashcard
              question={card.recall.q}
              answer={card.recall.a}
              revealed={page.revealed}
              grade={page.grade}
              onReveal={() => {
                session.reveal(entryIndex);
              }}
              onGrade={(grade) => void session.gradeFlashcard(entryIndex, grade)}
            />
          ) : null}

          {/* After a retrieval the whole card is one tap away, for a look at what was missed. */}
          {retrieval && answered && form !== 'myth' && card.type !== 'quiz' ? (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                aria-expanded={showFull}
                onClick={() => {
                  setShowFull(!showFull);
                }}
                className="min-h-12 self-start text-sm font-semibold text-accent-fg underline underline-offset-4"
              >
                {showFull ? sk.cards.hideFullCard : sk.cards.showFullCard}
              </button>
              {showFull ? (
                <div ref={fullCard}>
                  <ReadingCard card={card} showGermanTerms={settings.showGermanTerms} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {/* A card longer than the screen scrolls. Its text then fades out at the edge instead
            of ending in the middle of a line, and the last line clears the fade at the end. */}
        <div
          aria-hidden="true"
          className="pointer-events-none sticky bottom-0 -mt-6 h-6 shrink-0 bg-linear-to-b from-transparent to-bg"
        />
      </div>

      <ActionBar actions={actions} />

      <FlagSheet
        open={flagOpen}
        current={flagged ? flagged.note : null}
        onSubmit={(note) => {
          void session.flag(entryIndex, note);
          setFlagOpen(false);
        }}
        onRemove={() => {
          void session.flag(entryIndex, null);
          setFlagOpen(false);
        }}
        onClose={() => {
          setFlagOpen(false);
        }}
      />
    </article>
  );
}
