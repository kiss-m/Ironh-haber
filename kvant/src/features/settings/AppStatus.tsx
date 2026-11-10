import { useLiveQuery } from 'dexie-react-hooks';
import { useId } from 'react';
import { db } from '../../data/db.ts';
import { sk } from '../../i18n/sk.ts';
import { useOfflineStatus, type OfflineStatus } from './useOfflineStatus.ts';

const OFFLINE_LABEL: Record<OfflineStatus, string> = {
  ready: sk.status.offlineReady,
  pending: sk.status.offlinePending,
  unsupported: sk.status.offlineUnsupported,
  dev: sk.status.offlineDev,
};

/** `undefined` while the database opens, `null` when it cannot be opened. */
async function countCards(): Promise<number | null> {
  try {
    return await db.cards.count();
  } catch {
    return null;
  }
}

/** What a tester checks on the phone: the version, offline readiness and the database. */
export function AppStatus() {
  const headingId = useId();
  const offline = useOfflineStatus();
  const cardCount = useLiveQuery(countCards);

  const database =
    cardCount === undefined
      ? sk.status.databaseOpening
      : cardCount === null
        ? sk.status.databaseError
        : sk.status.databaseReady;

  const rows = [
    { label: sk.status.version, value: __APP_VERSION__, ok: true },
    { label: sk.status.offline, value: OFFLINE_LABEL[offline], ok: offline === 'ready' },
    { label: sk.status.database, value: database, ok: typeof cardCount === 'number' },
    { label: sk.status.cards, value: String(cardCount ?? '–'), ok: typeof cardCount === 'number' },
  ];

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-line bg-surface px-4 pt-4 pb-2"
    >
      <h2 id={headingId} className="text-xs font-semibold tracking-widest text-muted uppercase">
        {sk.status.heading}
      </h2>
      <dl className="mt-1 divide-y divide-line text-sm">
        {rows.map(({ label, value, ok }) => (
          <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
            <dt className="text-muted">{label}</dt>
            <dd className={`font-semibold tabular-nums ${ok ? 'text-fg' : 'text-muted'}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
