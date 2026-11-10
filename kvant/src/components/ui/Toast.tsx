import { motion } from 'motion/react';
import type { ReactNode } from 'react';

interface ToastProps {
  children: ReactNode;
  /** Buttons shown after the message. */
  actions?: ReactNode;
}

/** A short message above the tab bar. Render it inside <AnimatePresence>. */
export function Toast({ children, actions }: ToastProps) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-auto flex w-full max-w-md flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-2xl border border-line bg-raised py-2 pr-2 pl-4 shadow-lg"
    >
      <div className="min-w-0 flex-1 basis-40 py-1 text-sm">{children}</div>
      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </motion.div>
  );
}
