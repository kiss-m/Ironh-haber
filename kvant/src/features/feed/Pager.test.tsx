import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pager, type PagerHandle } from './Pager.tsx';

const PAGE_HEIGHT = 800;

/** jsdom has no layout, so the tests give the scroll area a height and a position. */
function layOut(
  element: HTMLElement,
  height: number = PAGE_HEIGHT,
): { scrollTo: (top: number) => void } {
  let top = 0;
  // What a browser reports: the exact height in the rectangle, a rounded one in `clientHeight`.
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: Math.round(height) });
  element.getBoundingClientRect = () => new DOMRect(0, 0, 360, height);
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  return {
    scrollTo(value) {
      top = value;
    },
  };
}

function Harness({
  count = 12,
  start = 0,
  onChange,
  handle,
}: {
  count?: number;
  start?: number;
  onChange?: (index: number) => void;
  handle?: React.Ref<PagerHandle>;
}) {
  const [index, setIndex] = useState(start);
  return (
    <>
      <Pager
        ref={handle}
        label="Skúšobný feed"
        count={count}
        index={index}
        onIndexChange={(next) => {
          onChange?.(next);
          setIndex(next);
        }}
        renderPage={(page) => (
          <div>
            <p>Strana {page}</p>
            <button type="button">Tlačidlo {page}</button>
          </div>
        )}
      />
      <button
        type="button"
        onClick={() => {
          setIndex(0);
        }}
      >
        Na začiatok
      </button>
    </>
  );
}

function feed(): HTMLElement {
  return screen.getByRole('feed', { name: 'Skúšobný feed', hidden: true });
}

function renderedPages(): string[] {
  return screen.getAllByText(/^Strana \d+$/).map((node) => node.textContent);
}

/** Makes the window look like a browser that sends `scrollend`. jsdom is not one. */
function supportScrollEnd(): void {
  Object.defineProperty(window, 'onscrollend', { configurable: true, writable: true, value: null });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'onscrollend');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Pager', () => {
  it('keeps a place for every page but renders only those around the current one', () => {
    render(<Harness start={5} />);

    expect(feed().children).toHaveLength(12);
    expect(renderedPages()).toEqual([
      'Strana 2',
      'Strana 3',
      'Strana 4',
      'Strana 5',
      'Strana 6',
      'Strana 7',
      'Strana 8',
    ]);
  });

  it('hides every page but the current one from assistive technology', () => {
    render(<Harness start={1} />);

    const pages = [...feed().children];
    expect(pages[1]).not.toHaveAttribute('aria-hidden');
    expect(pages[0]).toHaveAttribute('aria-hidden', 'true');
    expect(pages[2]).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Tlačidlo 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tlačidlo 2' })).not.toBeInTheDocument();
  });

  it.each([
    ['ArrowDown', 3, 4],
    ['PageDown', 3, 4],
    ['ArrowUp', 3, 2],
    ['PageUp', 3, 2],
  ])('moves with %s', async (key, from, to) => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness start={from} onChange={onChange} />);

    feed().focus();
    await user.keyboard(`{${key}}`);

    expect(onChange).toHaveBeenCalledExactlyOnceWith(to);
  });

  it('stops at the first and the last page', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness count={3} onChange={onChange} />);

    feed().focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(onChange.mock.calls).toEqual([[1], [2]]);
  });

  it('leaves the keys alone while a control inside a card has the focus', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    screen.getByRole('button', { name: 'Tlačidlo 0' }).focus();
    await user.keyboard('{ArrowDown}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes the page the scroll comes to rest on as the current one', () => {
    supportScrollEnd();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const layout = layOut(feed());

    layout.scrollTo(2 * PAGE_HEIGHT + 30);
    fireEvent(feed(), new Event('scrollend'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('does not take a finger resting in mid-swipe for a change of page', () => {
    supportScrollEnd();
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const layout = layOut(feed());

    // Most of the way to the next page, and then the finger holds still for a second.
    layout.scrollTo(PAGE_HEIGHT * 0.8);
    fireEvent.scroll(feed());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).not.toHaveBeenCalled();

    // Let go: the snap finishes on the next page.
    layout.scrollTo(PAGE_HEIGHT);
    fireEvent(feed(), new Event('scrollend'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('waits for the scroll to settle where the browser sends no scrollend', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const layout = layOut(feed());

    // Half-way to the next page and still moving: nothing is decided yet.
    layout.scrollTo(PAGE_HEIGHT / 2 - 10);
    fireEvent.scroll(feed());
    act(() => {
      vi.advanceTimersByTime(100);
    });
    layout.scrollTo(PAGE_HEIGHT);
    fireEvent.scroll(feed());
    act(() => {
      vi.advanceTimersByTime(119);
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('finds the right page when a page is not a whole number of pixels high', () => {
    // 504.667 px is a real case: a 320 x 568 screen less the tab bar. Rounded to 505 px, the
    // error grows by a third of a pixel per page.
    supportScrollEnd();
    const height = 504.667;
    const onChange = vi.fn();
    const handle = createRef<PagerHandle>();
    render(<Harness count={1000} onChange={onChange} handle={handle} />);
    const layout = layOut(feed(), height);
    const scrollTo = vi.spyOn(feed(), 'scrollTo');

    layout.scrollTo(800 * height);
    fireEvent(feed(), new Event('scrollend'));
    expect(onChange).toHaveBeenLastCalledWith(800);

    act(() => {
      handle.current?.goTo(801);
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 801 * height, behavior: 'smooth' });
  });

  it('does not report a swipe that was taken back', () => {
    supportScrollEnd();
    const onChange = vi.fn();
    render(<Harness start={4} onChange={onChange} />);
    const layout = layOut(feed());

    layout.scrollTo(4 * PAGE_HEIGHT + 120);
    fireEvent.scroll(feed());
    layout.scrollTo(4 * PAGE_HEIGHT);
    fireEvent(feed(), new Event('scrollend'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('scrolls to the page when the index is changed from outside', async () => {
    const user = userEvent.setup();
    render(<Harness start={6} />);
    const layout = layOut(feed());
    layout.scrollTo(6 * PAGE_HEIGHT);
    const scrollTo = vi.spyOn(feed(), 'scrollTo');

    await user.click(screen.getByRole('button', { name: 'Na začiatok' }));

    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0 });
    expect(renderedPages()).toEqual(['Strana 0', 'Strana 1', 'Strana 2', 'Strana 3']);
  });

  it('can be moved from code, as the "Pokračovať" button of a checkpoint does', () => {
    const onChange = vi.fn();
    const handle = createRef<PagerHandle>();
    render(<Harness start={2} onChange={onChange} handle={handle} />);
    const layout = layOut(feed());
    layout.scrollTo(2 * PAGE_HEIGHT);
    const scrollTo = vi.spyOn(feed(), 'scrollTo');

    act(() => {
      handle.current?.goTo(3);
    });

    expect(onChange).toHaveBeenCalledExactlyOnceWith(3);
    // One smooth scroll, and no jump on top of it while the page is still on its way.
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 3 * PAGE_HEIGHT, behavior: 'smooth' });
  });

  it('opens on the page it is given', () => {
    // The feed keeps its place while the reader is on another tab, and comes back to it.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 360, PAGE_HEIGHT),
    );
    const scrollTo = vi.spyOn(Element.prototype, 'scrollTo');

    render(<Harness start={7} />);

    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 7 * PAGE_HEIGHT });
  });

  it('does not scroll when it opens on the first page', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 360, PAGE_HEIGHT),
    );
    const scrollTo = vi.spyOn(Element.prototype, 'scrollTo');

    render(<Harness />);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
