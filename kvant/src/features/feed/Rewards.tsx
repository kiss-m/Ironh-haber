import { motion } from 'motion/react';
import { useEffect } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import { sk } from '../../i18n/sk.ts';

const FLOAT_SECONDS = 1.4;
const LEVEL_UP_MS = 4000;

/**
 * The "+5 XP" that rises under the status corner whenever a card earns something. Each gain is
 * its own element, keyed by the gain, so it plays once: in, hold, out.
 */
export function XpFloat({ reward }: { reward: { id: number; xp: number } | null }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+3.25rem)] right-4 z-10"
    >
      {reward ? (
        <motion.span
          key={reward.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -14] }}
          transition={{ duration: FLOAT_SECONDS, times: [0, 0.15, 0.8, 1] }}
          className="block rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-on-accent tabular-nums"
        >
          {sk.feed.xp(reward.xp)}
        </motion.span>
      ) : null}
    </div>
  );
}

/**
 * A short celebration of a new character level. It goes away by itself, on a tap anywhere, or
 * with its button. It is removed at once, without an exit animation, so that it can never be
 * left standing over the feed.
 */
export function LevelUp({ level, onClose }: { level: number | null; onClose: () => void }) {
  useEffect(() => {
    if (level === null) return;
    const timer = setTimeout(onClose, LEVEL_UP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [level, onClose]);

  if (level === null) return null;
  return (
    <motion.div
      key={level}
      role="status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
      className="absolute inset-0 z-20 flex items-center justify-center bg-bg/85 px-8"
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        className="flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl border border-accent bg-raised px-6 py-8 text-center shadow-[0_0_4rem_-1rem] shadow-accent/60"
      >
        <p className="text-xs font-semibold tracking-widest text-accent-fg uppercase">
          {sk.feed.levelUp}
        </p>
        <p className="font-display text-4xl font-bold tabular-nums">{sk.feed.level(level)}</p>
        <Button onClick={onClose}>{sk.feed.levelUpClose}</Button>
      </motion.div>
    </motion.div>
  );
}
