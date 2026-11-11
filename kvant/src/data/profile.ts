/** The character and the settings: created by onboarding, changed in Settings. */
import { DEFAULT_CATEGORY_WEIGHT, DEFAULT_DAILY_GOAL, NEW_CARD_CAP, SRS } from '../core/config.ts';
import type { KvantDb } from './db.ts';
import type { CharacterRow, SettingsRow, ThemeName } from './types.ts';

export function defaultSettings(theme: ThemeName = 'dark'): SettingsRow {
  return {
    id: 'me',
    categoryWeights: {},
    dailyGoal: DEFAULT_DAILY_GOAL,
    newCardCap: NEW_CARD_CAP,
    desiredRetention: SRS.defaultRetention,
    serendipity: true,
    streakEnabled: false,
    showGermanTerms: true,
    theme,
    reminders: { enabled: false, times: [] },
  };
}

/** The weights of a fresh selection: every chosen category at the default weight. */
export function weightsFor(categoryIds: readonly string[]): Record<string, number> {
  return Object.fromEntries(categoryIds.map((id) => [id, DEFAULT_CATEGORY_WEIGHT]));
}

export interface ProfileInput {
  name: string;
  /** categoryId → weight 0–100. Categories left out are not selected. */
  categoryWeights: Record<string, number>;
  dailyGoal: number;
  theme: ThemeName;
}

/** Creates the character and the settings in one step. This is what finishes onboarding. */
export async function createProfile(db: KvantDb, input: ProfileInput, now: Date): Promise<void> {
  const character: CharacterRow = {
    id: 'me',
    name: input.name.trim(),
    totalXp: 0,
    attributeXp: { T: 0, R: 0, B: 0, M: 0, W: 0, J: 0 },
    createdAt: now.getTime(),
  };
  const settings: SettingsRow = {
    ...defaultSettings(input.theme),
    categoryWeights: input.categoryWeights,
    dailyGoal: input.dailyGoal,
  };
  await db.transaction('rw', [db.character, db.settings], async () => {
    await db.character.put(character);
    await db.settings.put(settings);
  });
}

/** The stored settings, or the defaults before onboarding has run. */
export async function loadSettings(db: KvantDb): Promise<SettingsRow> {
  return (await db.settings.get('me')) ?? defaultSettings();
}

export async function updateSettings(
  db: KvantDb,
  patch: Partial<Omit<SettingsRow, 'id'>>,
): Promise<void> {
  await db.transaction('rw', [db.settings], async () => {
    await db.settings.put({ ...(await loadSettings(db)), ...patch, id: 'me' });
  });
}
