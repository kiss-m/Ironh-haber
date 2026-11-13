import { useCallback, useEffect, useState } from 'react';
import { syncContent } from '../data/contentSync.ts';
import { db } from '../data/db.ts';

export type ContentStatus = 'loading' | 'ready' | 'error';

/**
 * Keeps the content tables current. The app is usable as soon as any content is stored: an
 * import that runs after that happens in the background. Only a first start without a
 * connection ends in 'error', because then there is nothing to show yet.
 */
export function useContentSync(): { status: ContentStatus; retry: () => void } {
  const [status, setStatus] = useState<ContentStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      let stored = false;
      try {
        stored = (await db.contentMeta.count()) > 0;
        if (stored && !cancelled) setStatus('ready');
        await syncContent();
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled && !stored) setStatus('error');
      }
    }

    void run();

    // Back online: pick up an import that failed halfway, for example on the very first start.
    const onOnline = () => {
      void run();
    };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((count) => count + 1);
  }, []);

  return { status, retry };
}
