import { useSyncExternalStore } from 'react';
import { learningDay, nextLearningDayStart, type LearningDay } from '../core/day.ts';

/**
 * Tells React when to look at the clock again: when the app comes back to the foreground, and
 * at the start of the next learning day if it stays open that long.
 */
function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const now = new Date();
    // One second past the boundary, so a timer that fires a little early still sees the new day.
    const wait = nextLearningDayStart(now).getTime() - now.getTime() + 1000;
    timer = setTimeout(() => {
      onChange();
      arm();
    }, wait);
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') onChange();
  };

  arm();
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

function today(): LearningDay {
  return learningDay(new Date());
}

/**
 * The current learning day. A phone keeps the app in memory for days, so "today" cannot be read
 * once: this value changes at 04:00, or when the app is brought back after that.
 */
export function useLearningDay(): LearningDay {
  return useSyncExternalStore(subscribe, today);
}
