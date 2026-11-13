import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReveal } from './useReveal.ts';

/** Where the boxes are, by their `data-box` name. jsdom has no layout of its own. */
let boxes: Record<string, DOMRect>;

function Card({ shownAtFirst = false }: { shownAtFirst?: boolean }) {
  const [shown, setShown] = useState(shownAtFirst);
  const answer = useReveal<HTMLDivElement>(shown);
  return (
    <div data-box="pager" style={{ overflowY: 'auto' }}>
      <div data-box="card" style={{ overflowY: 'auto' }}>
        <div data-box="text">
          <button
            type="button"
            onClick={() => {
              setShown(true);
            }}
          >
            Ukázať
          </button>
          {shown ? (
            <div ref={answer} data-box="answer">
              Odpoveď
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const scrollBy = vi.fn<(this: Element, options: ScrollToOptions) => void>();
const scrollIntoView = vi.fn<() => void>();

const scrolls = () => scrollBy.mock.calls.map((call) => call[0]);

beforeEach(() => {
  // A card area 400 px high, starting 100 px from the top of the screen.
  boxes = { card: new DOMRect(0, 100, 360, 400), pager: new DOMRect(0, 0, 360, 600) };
  document.documentElement.style.fontSize = '16px';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return boxes[this.dataset.box ?? ''] ?? new DOMRect();
  });
  scrollBy.mockReset();
  scrollIntoView.mockReset();
  // jsdom has neither method. Whatever the hook calls ends up in these two.
  Object.defineProperty(Element.prototype, 'scrollBy', {
    configurable: true,
    writable: true,
    value: scrollBy,
  });
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  document.documentElement.style.fontSize = '';
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  vi.restoreAllMocks();
});

describe('useReveal', () => {
  it('scrolls the card to a part that appears below its edge', async () => {
    const user = userEvent.setup();
    render(<Card />);
    // The answer will sit from 460 to 540 px. The card ends at 500 px, and its last 24 px fade.
    boxes.answer = new DOMRect(0, 460, 360, 80);

    await user.click(screen.getByRole('button', { name: 'Ukázať' }));

    expect(scrolls()).toEqual([{ top: 64 }]);
    // It is the card that scrolls, not the pager around it.
    expect(scrollBy.mock.contexts[0]).toHaveAttribute('data-box', 'card');
  });

  it('leaves the card alone when the new part is in view already', async () => {
    const user = userEvent.setup();
    render(<Card />);
    boxes.answer = new DOMRect(0, 300, 360, 80);

    await user.click(screen.getByRole('button', { name: 'Ukázať' }));

    expect(scrolls()).toEqual([]);
  });

  it('does not scroll the top of a tall part out of view', async () => {
    const user = userEvent.setup();
    render(<Card />);
    // 600 px tall, starting 150 px below the top of the card: it can move up by 150 px only.
    boxes.answer = new DOMRect(0, 250, 360, 600);

    await user.click(screen.getByRole('button', { name: 'Ukázať' }));

    expect(scrolls()).toEqual([{ top: 150 }]);
  });

  it('does nothing for a card that is rendered with the part already showing', () => {
    // The reader swipes back to an answered card. Nothing was revealed just now.
    boxes.answer = new DOMRect(0, 460, 360, 80);

    render(<Card shownAtFirst />);

    expect(scrolls()).toEqual([]);
  });

  it('never uses scrollIntoView, which would move the pager too', async () => {
    const user = userEvent.setup();
    render(<Card />);
    boxes.answer = new DOMRect(0, 460, 360, 80);

    await user.click(screen.getByRole('button', { name: 'Ukázať' }));

    expect(scrollBy).toHaveBeenCalledOnce();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
