import { useLiveQuery } from 'dexie-react-hooks';
import { useLearningDay } from '../../app/useLearningDay.ts';
import { db } from '../../data/db.ts';
import type { DailyRow } from '../../data/types.ts';

/** The figures of the current learning day, live. Undefined until something is recorded today. */
export function useDaily(): DailyRow | undefined {
  const day = useLearningDay();
  return useLiveQuery(() => db.daily.get(day), [day]);
}
