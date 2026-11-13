import { AnimatePresence } from 'motion/react';
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../components/ui/Button.tsx';
import { Toast } from '../components/ui/Toast.tsx';
import { sk } from '../i18n/sk.ts';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const OFFLINE_READY_VISIBLE_MS = 6000;

/**
 * An installed app can stay in memory for days without a page load, and a page load is the only
 * moment the browser looks for a new service worker by itself. So also look whenever the app
 * comes back to the foreground, at most once an hour.
 */
function checkForUpdatesOnReturn(registration: ServiceWorkerRegistration): void {
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = Date.now();
    registration.update().catch(() => {
      // Offline or a failed request: the next return to the app tries again.
    });
  });
}

/**
 * Registers the service worker and shows its two messages: "ready to work offline" after the
 * first visit, and "new version" when an update is waiting. The update is applied only when the
 * user asks for it, so a learning session is never reloaded mid-card.
 */
export function PwaToasts() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_scriptUrl, registration) {
      if (registration) checkForUpdatesOnReturn(registration);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => {
      setOfflineReady(false);
    }, OFFLINE_READY_VISIBLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [offlineReady, setOfflineReady]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] z-50 flex justify-center px-4">
      <AnimatePresence mode="wait">
        {needRefresh ? (
          <Toast
            key="update"
            actions={
              <>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setNeedRefresh(false);
                  }}
                >
                  {sk.pwa.later}
                </Button>
                <Button
                  onClick={() => {
                    void updateServiceWorker(true);
                  }}
                >
                  {sk.pwa.reload}
                </Button>
              </>
            }
          >
            <strong className="block font-display text-base">{sk.pwa.updateTitle}</strong>
            {sk.pwa.updateBody}
          </Toast>
        ) : offlineReady ? (
          <Toast
            key="offline"
            actions={
              <Button
                variant="quiet"
                onClick={() => {
                  setOfflineReady(false);
                }}
              >
                {sk.pwa.close}
              </Button>
            }
          >
            {sk.pwa.offlineReady}
          </Toast>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
