import { useEffect, useState } from 'react';

export type OfflineStatus = 'ready' | 'pending' | 'unsupported' | 'dev';

function initialStatus(): OfflineStatus {
  // The service worker is only built for production; `npm run dev` runs without one.
  if (import.meta.env.DEV) return 'dev';
  return 'serviceWorker' in navigator ? 'pending' : 'unsupported';
}

/**
 * Whether the app can start without a network. An active service worker has finished
 * installing, and installing is when the whole app shell is put into the cache.
 */
export function useOfflineStatus(): OfflineStatus {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (status !== 'pending') return;
    let cancelled = false;
    void navigator.serviceWorker.ready.then(() => {
      if (!cancelled) setStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return status;
}
