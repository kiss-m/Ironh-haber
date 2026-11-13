import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db.ts';
import { defaultSettings } from '../../data/profile.ts';
import type { SettingsRow } from '../../data/types.ts';

const DEFAULTS = defaultSettings();

/** The stored settings, live. Before they are loaded, and before onboarding, the defaults. */
export function useSettings(): SettingsRow {
  return useLiveQuery(() => db.settings.get('me')) ?? DEFAULTS;
}
