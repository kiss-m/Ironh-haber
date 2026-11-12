import { useEffect, useRef, type RefObject } from 'react';

/** The nearest ancestor that scrolls vertically: for a card in a session, the card's own area. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/** Scrolls the card just far enough to show the element, without pushing its top out of view. */
function scrollIntoCard(element: HTMLElement): void {
  const scroller = scrollParent(element);
  if (!scroller) return;
  const box = element.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  // The bottom edge of a card fades out over 1.5 rem (see CardPage).
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const fade = 1.5 * rem;
  const hidden = box.bottom - (view.bottom - fade);
  const room = box.top - view.top;
  const distance = Math.min(hidden, room);
  if (distance > 0) scroller.scrollBy({ top: distance });
}

/**
 * For the part of a card that appears after a tap: an explanation, a flashcard answer, the
 * simpler wording. On a small screen it can land below the edge, where it would go unnoticed,
 * so the card scrolls to it.
 *
 * Only the moment `shown` turns true counts. A card that is rendered again with the part already
 * showing, as happens when the reader swipes back to it, stays where it is. Scrolling is done on
 * the card's own scroll area, never with `scrollIntoView`, which would move the pager as well.
 */
export function useReveal<T extends HTMLElement>(shown: boolean): RefObject<T | null> {
  const ref = useRef<T>(null);
  const wasShown = useRef(shown);

  useEffect(() => {
    if (shown && !wasShown.current && ref.current) scrollIntoCard(ref.current);
    wasShown.current = shown;
  }, [shown]);

  return ref;
}
