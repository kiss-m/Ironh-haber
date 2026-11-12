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

/**
 * Without `scrollend`: how long the scroll events must pause before the page under the finger
 * counts as the current one.
 */
const SETTLE_MS = 120;

/**
 * The height of one page. Not `clientHeight`, which is rounded to whole pixels: on many phones a
 * page is a fraction of a pixel taller or shorter than that, and over a long feed the rounding
 * error would add up to a wrong page.
 */
function pageHeight(element: HTMLElement): number {
  return element.getBoundingClientRect().height;
}

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
  const indexRef = useRef(index);
  /**
   * The page this pager itself last moved to, by a swipe or by `goTo`. An index that differs
   * from it was set from outside, and only then does the scroll position have to follow.
   */
  const ownIndex = useRef<number | null>(null);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const settle = useCallback(() => {
    const element = container.current;
    const height = element ? pageHeight(element) : 0;
    if (!element || height === 0) return;
    const resting = Math.round(element.scrollTop / height);
    const clamped = Math.min(Math.max(resting, 0), count - 1);
    ownIndex.current = clamped;
    if (clamped !== indexRef.current) onIndexChange(clamped);
  }, [count, onIndexChange]);

  const goTo = useCallback(
    (target: number) => {
      const next = Math.min(Math.max(target, 0), count - 1);
      const element = container.current;
      if (element) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        element.scrollTo({
          top: next * pageHeight(element),
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
      ownIndex.current = next;
      if (next !== indexRef.current) onIndexChange(next);
    },
    [count, onIndexChange],
  );

  useImperativeHandle(ref, () => ({ goTo }), [goTo]);

  // Bring the scroll position in step when the index was set from outside: when the screen opens
  // on a page other than the first, and on a reset. A move of the pager's own is left alone, or
  // this jump would cut short the smooth scroll that `goTo` has just started.
  useEffect(() => {
    const element = container.current;
    const height = element ? pageHeight(element) : 0;
    if (!element || height === 0 || ownIndex.current === index) return;
    ownIndex.current = index;
    const resting = Math.round(element.scrollTop / height);
    if (resting !== index) element.scrollTo({ top: index * height });
  }, [index]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    // `scrollend` fires once the finger is up and the snap has finished, which is exactly the
    // moment a page becomes the current one. Where a browser has it, nothing else is needed.
    if ('onscrollend' in window) {
      element.addEventListener('scrollend', settle);
      return () => {
        element.removeEventListener('scrollend', settle);
      };
    }

    // Elsewhere, a pause in the scroll events has to do.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      element.removeEventListener('scroll', onScroll);
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
      className="h-full snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:none]"
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
