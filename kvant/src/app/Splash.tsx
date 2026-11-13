import { BrandMark } from '../components/ui/BrandMark.tsx';
import { Button } from '../components/ui/Button.tsx';
import { sk } from '../i18n/sk.ts';

interface SplashProps {
  /** Set when loading failed. Shows the reason and a way to try again. */
  onRetry?: () => void;
}

/** What is shown while the app prepares itself, or when the first start has no connection. */
export function Splash({ onRetry }: SplashProps) {
  return (
    <div
      role={onRetry ? 'alert' : 'status'}
      className="flex min-h-dvh flex-col items-center justify-center gap-5 px-8 text-center"
    >
      <BrandMark className={`h-16 w-auto ${onRetry ? '' : 'motion-safe:animate-pulse'}`} />
      {onRetry ? (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight">{sk.start.errorTitle}</h1>
          <p className="text-pretty text-muted">{sk.start.errorBody}</p>
          <Button onClick={onRetry}>{sk.start.retry}</Button>
        </>
      ) : (
        <p className="text-muted">{sk.start.loading}</p>
      )}
    </div>
  );
}
