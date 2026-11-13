import { Button } from '../components/ui/Button.tsx';
import { Screen } from '../components/ui/Screen.tsx';
import { sk } from '../i18n/sk.ts';

/**
 * Shown when a screen throws while rendering. Progress is safe in IndexedDB, so the honest
 * remedy is to load the app again. React Router logs the error itself.
 */
export function ErrorScreen() {
  return (
    <div role="alert" className="flex min-h-dvh flex-col justify-center">
      <Screen>
        <h1 className="font-display text-3xl font-bold tracking-tight">{sk.error.title}</h1>
        <p className="text-pretty">{sk.error.body}</p>
        <Button
          className="self-start"
          onClick={() => {
            window.location.reload();
          }}
        >
          {sk.error.reload}
        </Button>
      </Screen>
    </div>
  );
}
