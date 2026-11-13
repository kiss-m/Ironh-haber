import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../../shared/schema.ts';
import { seedPacks } from '../../test/seed.ts';
import { Flashcard } from './Flashcard.tsx';
import { Formula } from './Formula.tsx';
import { MythCard } from './MythCard.tsx';
import { QuizCard } from './QuizCard.tsx';
import { ReadingCard } from './ReadingCard.tsx';

const cards = new Map<string, Card>(
  seedPacks().flatMap((pack) => pack.cards.map((card): [string, Card] => [card.id, card])),
);

function card(id: string): Card {
  const found = cards.get(id);
  if (!found) throw new Error(`No seed card ${id}`);
  return found;
}

describe('ReadingCard', () => {
  it('shows a concept with its title, text and terms', () => {
    render(<ReadingCard card={card('robotika.kinematika.dh-parametre')} showGermanTerms />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Denavitove–Hartenbergove parametre',
    );
    expect(screen.getByText(/Polohu každého článku robota/)).toBeInTheDocument();
    expect(screen.getByText('Denavit–Hartenberg parameters')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Denavit-Hartenberg-Parameter')).toHaveAttribute('lang', 'de');
    // The simple wording stays hidden until the reader asks for it.
    expect(screen.queryByText(/Dohodnutý spôsob/)).not.toBeInTheDocument();
  });

  it('hides the German term when the setting is off', () => {
    render(<ReadingCard card={card('robotika.kinematika.dh-parametre')} showGermanTerms={false} />);

    expect(screen.getByText('Denavit–Hartenberg parameters')).toBeInTheDocument();
    expect(screen.queryByText('Denavit-Hartenberg-Parameter')).not.toBeInTheDocument();
  });

  it('adds the simple wording after "Nerozumiem"', () => {
    render(
      <ReadingCard card={card('robotika.kinematika.dh-parametre')} showGermanTerms notUnderstood />,
    );

    expect(screen.getByText('Jednoduchšie')).toBeInTheDocument();
    expect(screen.getByText(/Dohodnutý spôsob, ako štyrmi číslami/)).toBeInTheDocument();
    expect(screen.getByText('Karta sa o chvíľu vráti.')).toBeInTheDocument();
  });

  it('tells the reader the card will return even when there is no simpler wording', () => {
    render(
      <ReadingCard card={card('robotika.zaklady.katalogovy-list')} showGermanTerms notUnderstood />,
    );

    expect(screen.queryByText('Jednoduchšie')).not.toBeInTheDocument();
    expect(screen.getByText('Karta sa o chvíľu vráti.')).toBeInTheDocument();
  });

  it('shows a formula with its legend, text and worked example', async () => {
    render(
      <ReadingCard card={card('fyzika-mechanika.rotacia.vykon-na-hriadeli')} showGermanTerms />,
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Výkon na hriadeli');
    const legend = within(screen.getByLabelText('Veličiny'));
    expect(legend.getByText(/mechanický výkon/)).toHaveTextContent('mechanický výkon · W');
    expect(legend.getByText(/uhlová rýchlosť/)).toHaveTextContent('uhlová rýchlosť · rad/s');
    expect(screen.getByText(/Výkon rotujúceho hriadeľa/)).toBeInTheDocument();
    expect(screen.getByText(/Motor s momentom 10 N·m/)).toBeInTheDocument();
    // KaTeX arrives a moment later and replaces the source text with typeset maths.
    await vi.waitFor(() => {
      expect(document.querySelector('.katex-display')).not.toBeNull();
    });
  });
});

describe('Formula', () => {
  it('typesets LaTeX, with MathML for screen readers', async () => {
    const { container } = render(<Formula latex={'P = M\\,\\omega'} display />);

    await vi.waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull();
    });
    expect(container.querySelector('math')).not.toBeNull();
    expect(container.querySelector('annotation')?.textContent).toBe('P = M\\,\\omega');
  });

  it('shows broken LaTeX as an error instead of crashing the card', async () => {
    const { container } = render(<Formula latex={'\\frac{1}{'} />);

    await vi.waitFor(() => {
      expect(container.querySelector('.katex-error')).not.toBeNull();
    });
  });
});

describe('QuizCard', () => {
  const quiz = {
    question: 'Koľko stupňov voľnosti má teleso v priestore?',
    options: ['Tri', 'Šesť', 'Deväť'],
    correctIndex: 1,
    explanation: 'Tri posuvy a tri rotácie.',
  };

  it('offers the options and reports the pick', async () => {
    const onAnswer = vi.fn();
    render(<QuizCard {...quiz} chosen={null} onAnswer={onAnswer} />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Tri',
      'Šesť',
      'Deväť',
    ]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Deväť' }));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('confirms a correct answer and explains it', () => {
    render(<QuizCard {...quiz} chosen={1} onAnswer={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Správne');
    expect(screen.getByRole('status')).toHaveTextContent('Tri posuvy a tri rotácie.');
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Šesť' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks a wrong answer and still shows the right one', () => {
    render(<QuizCard {...quiz} chosen={0} onAnswer={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nesprávne');
    expect(screen.getByRole('status')).toHaveTextContent('Tri posuvy a tri rotácie.');
    expect(screen.getByRole('button', { name: 'Tri' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Šesť' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('cannot be answered twice', async () => {
    const onAnswer = vi.fn();
    render(<QuizCard {...quiz} chosen={0} onAnswer={onAnswer} />);

    await userEvent.click(screen.getByRole('button', { name: 'Šesť' }));
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('MythCard', () => {
  const myth = {
    statement: 'Ťažšie teleso padá vo vákuu rýchlejšie ako ľahšie.',
    isTrue: false,
    explanation: 'Zrýchlenie je pre všetky telesá rovnaké.',
  };

  it('asks for a verdict', async () => {
    const onAnswer = vi.fn();
    render(<MythCard {...myth} verdict={null} onAnswer={onAnswer} />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '„Ťažšie teleso padá vo vákuu rýchlejšie ako ľahšie.“',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mýtus' }));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('confirms the right verdict', () => {
    render(<MythCard {...myth} verdict={false} onAnswer={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Správne · Je to mýtus.');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Zrýchlenie je pre všetky telesá rovnaké.',
    );
  });

  it('corrects the wrong verdict', () => {
    render(<MythCard {...myth} verdict onAnswer={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nesprávne · Je to mýtus.');
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('says so when the statement is true', () => {
    render(<MythCard {...myth} isTrue verdict onAnswer={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Správne · Je to pravda.');
  });
});

describe('Flashcard', () => {
  const flashcard = { question: 'Od čoho závisí moment sily?', answer: 'Od sily a jej ramena.' };

  it('keeps the answer hidden until asked', async () => {
    const onReveal = vi.fn();
    render(
      <Flashcard
        {...flashcard}
        revealed={false}
        grade={null}
        onReveal={onReveal}
        onGrade={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Od čoho závisí moment sily?',
    );
    expect(screen.queryByText('Od sily a jej ramena.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ukázať odpoveď' }));
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it('shows the answer with the four grade buttons of the spec', async () => {
    const onGrade = vi.fn();
    render(<Flashcard {...flashcard} revealed grade={null} onReveal={vi.fn()} onGrade={onGrade} />);

    expect(screen.getByRole('status')).toHaveTextContent('Od sily a jej ramena.');
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Nevedel',
      'Ťažké',
      'Vedel',
      'Ľahké',
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Ťažké' }));
    expect(onGrade).toHaveBeenCalledExactlyOnceWith('hard');
  });

  it('locks the grade once it is given', () => {
    render(<Flashcard {...flashcard} revealed grade="good" onReveal={vi.fn()} onGrade={vi.fn()} />);

    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Vedel' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Nevedel' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
