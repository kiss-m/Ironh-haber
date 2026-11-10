import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { TabBar } from './TabBar.tsx';

/** The app shell: one screen that scrolls on its own, and the tab bar under it. */
export function AppLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);

  // A new screen starts at its top and takes the focus, so keyboard and screen reader users
  // land in the new content instead of staying on the tab they pressed.
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    mainRef.current?.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex h-dvh flex-col">
      <main
        ref={mainRef}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none"
      >
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
