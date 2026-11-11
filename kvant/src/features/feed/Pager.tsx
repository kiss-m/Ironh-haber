import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';

/** How many pages on each side of the current one are rendered: about seven in total. */
const WINDOW = 3;

/** How long scrolling must rest before the page under the finger counts as the current one. */
const SETTLE_MS = 120;

export interface PagerHandle {
  /** Moves to a page, as a swipe would. */
  goTo: (index: number) => void;
}

interface PagerProps {
  ref?: Ref<PagerHandle>;
  label: string;
  count: number;
  index: number;
  onIndexChange: (index: number) => void;
  renderPage: (index: number) => ReactNode;
}

/**
 * A vertical pager with one full-height page per swipe, built on native scroll snapping so the
 * gesture feels like any feed.
 *
 * Every page has its place in the scroll area, but only the pages around the current one are
 * rendered. The current page is whichever one the scroll comes to rest on, so a swipe that is
 * taken back does not count as leaving a card.
 */
export function Pager({ ref, label, count, index, onIndexChange, renderPage }: PagerProps) {
  const container = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const indexRef = useRef(index);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const settle = useCallback(() => {
    const element = container.current;
    if (!element || element.clientHeight === 0) return;
    const resting = Math.round(element.scrollTop / element.clientHeight);
    const clamped = Math.min(Math.max(resting, 0), count - 1);
    if (clamped !== indexRef.current) onIndexChange(clamped);
  }, [count, onIndexChange]);

  const goTo = useCallback(
    (target: number) => {
      const next = Math.min(Math.max(target, 0), count - 1);
      const element = container.current;
      if (element) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        element.scrollTo({
          top: next * element.clientHeight,
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
      if (next !== indexRef.current) onIndexChange(next);
    },
    [count, onIndexChange],
  );

  useImperativeHandle(ref, () => ({ goTo }), [goTo]);

  // Keep the scroll position in step when the index changes from outside, for example on a reset.
  useEffect(() => {
    const element = container.current;
    if (!element || element.clientHeight === 0) return;
    const resting = Math.round(element.scrollTop / element.clientHeight);
    if (resting !== index) element.scrollTo({ top: index * element.clientHeight });
  }, [index]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const onScroll = () => {
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(settle, SETTLE_MS);
    };
    const onScrollEnd = () => {
      clearTimeout(settleTimer.current);
      settle();
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('scrollend', onScrollEnd);
    return () => {
      clearTimeout(settleTimer.current);
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('scrollend', onScrollEnd);
    };
  }, [settle]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Leave the keys alone while the reader types or operates a control inside a card.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      goTo(index - 1);
    }
  }

  return (
    <div
      ref={container}
      role="feed"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]"
    >
      {Array.from({ length: count }, (_, page) => (
        <section
          key={page}
          aria-hidden={page === index ? undefined : true}
          className="h-full snap-start snap-always"
        >
          {Math.abs(page - index) <= WINDOW ? renderPage(page) : null}
        </section>
      ))}
    </div>
  );
}
