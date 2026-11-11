import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pager, type PagerHandle } from './Pager.tsx';

const PAGE_HEIGHT = 800;

/** jsdom has no layout, so the tests give the scroll area a height and a position. */
function layOut(element: HTMLElement): { scrollTo: (top: number) => void } {
  let top = 0;
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: PAGE_HEIGHT });
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

afterEach(() => {
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
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const layout = layOut(feed());

    layout.scrollTo(2 * PAGE_HEIGHT + 30);
    fireEvent(feed(), new Event('scrollend'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
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

  it('does not report a swipe that was taken back', () => {
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
    layOut(feed());
    const scrollTo = vi.spyOn(feed(), 'scrollTo');

    act(() => {
      handle.current?.goTo(3);
    });

    expect(onChange).toHaveBeenCalledExactlyOnceWith(3);
    expect(scrollTo).toHaveBeenCalledWith({ top: 3 * PAGE_HEIGHT, behavior: 'smooth' });
  });
});
