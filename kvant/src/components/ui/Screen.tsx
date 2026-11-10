import type { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
}

/** A page inside the app shell: readable width, clear of the status bar and display cutouts. */
export function Screen({ children }: ScreenProps) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-6 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8">
      {children}
    </div>
  );
}
