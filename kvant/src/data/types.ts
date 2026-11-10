/**
 * Row types of the `kvant` IndexedDB database (docs/SPEC.md section 6).
 *
 * Only keys and indexes are fixed by the Dexie schema in db.ts. Other fields can gain members
 * without a schema version bump, so the shapes marked "provisional" below belong to features that
 * arrive in later phases and may still change before any data is written.
 */
import type { BuiltCard, Category, Topic } from '../../shared/schema.ts';
import type { AttributeCode } from '../../shared/taxonomy.ts';

/** Epoch milliseconds. Every stored instant uses this, so indexes sort chronologically. */
export type Timestamp = number;

/** A learning day as `YYYY-MM-DD`. It runs from 04:00 to 04:00 local time (src/core/day.ts). */
export type LearningDay = string;

export type ThemeName = 'dark' | 'light';

// ---------------------------------------------------------------------------------------------
// Content tables: written only by the importer, never part of a backup
// ---------------------------------------------------------------------------------------------

export type CategoryRow = Category;

export interface TopicRow extends Topic {
  categoryId: string;
}

export type CardRow = BuiltCard & {
  categoryId: string;
  /** Set when the card disappears from its pack. Its user state is kept. */
  archived: boolean;
};

export interface ContentMetaRow {
  packId: string;
  version: number;
  hash: string;
  importedAt: Timestamp;
}

// ---------------------------------------------------------------------------------------------
// User state
// ---------------------------------------------------------------------------------------------

/**
 * A serialised ts-fsrs card. `due` is epoch milliseconds so that the `srs.due` index can
 * range-scan for due reviews. The remaining fields are owned by src/core/srs.ts (Phase 1).
 */
export interface SrsRecord {
  due: Timestamp;
  [field: string]: unknown;
}

export interface CardStateRow {
  cardId: string;
  firstSeenAt: Timestamp;
  lastSeenAt: Timestamp;
  seenCount: number;
  /** "Viac takého". */
  liked: boolean;
  /** "Uložiť". */
  bookmarked: boolean;
  /** "Už viem". */
  known: boolean;
  /** "Chyba", with an optional note. Cleared automatically when the card's content changes. */
  flagged: { at: Timestamp; note: string } | null;
  /** Null until the first exposure creates the schedule. */
  srs: SrsRecord | null;
  /** Once set the card stays in the Collection. */
  masteredAt: Timestamp | null;
}

export type ReviewMode = 'feed' | 'review' | 'boss';

/** FSRS grade: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type ReviewRating = 1 | 2 | 3 | 4;

export interface ReviewLogRow {
  /** Auto-incremented. */
  id: number;
  cardId: string;
  ts: Timestamp;
  rating: ReviewRating;
  mode: ReviewMode;
  responseMs: number;
}

export interface EventRow {
  /** Auto-incremented. */
  id: number;
  ts: Timestamp;
  learningDay: LearningDay;
  type: string;
  cardId?: string;
  payload?: unknown;
}

/** Provisional (Phase 3). */
export interface DailyQuestState {
  id: string;
  progress: number;
  target: number;
  done: boolean;
}

export interface DailyRow {
  learningDay: LearningDay;
  cardsSeen: number;
  newCards: number;
  answers: number;
  correct: number;
  xp: number;
  /** Counted only while the feed or a review is visible, at most 90 s per card. */
  activeSeconds: number;
  goalMet: boolean;
  quests: DailyQuestState[];
}

export interface CharacterRow {
  id: 'me';
  name: string;
  totalXp: number;
  attributeXp: Record<AttributeCode, number>;
  createdAt: Timestamp;
}

export interface TopicAffinityRow {
  topicId: string;
  /** Starts at 1.0 and stays within 0.5–2.0. */
  affinity: number;
}

/** Provisional (Phase 1): the adaptive difficulty target of one category. */
export interface CategoryDifficultyRow {
  categoryId: string;
  /** 1–5, starts at the category's `defaultDifficulty`. */
  target: number;
  /** Whether each of the last 20 graded answers was correct, oldest first. */
  recent: boolean[];
  answersSinceAdjust: number;
}

export interface SettingsRow {
  id: 'me';
  /** categoryId → weight 0–100. */
  categoryWeights: Record<string, number>;
  dailyGoal: number;
  newCardCap: number;
  desiredRetention: number;
  serendipity: boolean;
  streakEnabled: boolean;
  showGermanTerms: boolean;
  theme: ThemeName;
  /** Provisional (Phase 3): up to three local times as `HH:MM`. */
  reminders: { enabled: boolean; times: string[] };
}

/** Provisional (Phase 3). */
export interface AchievementRow {
  id: string;
  progress: number;
  unlockedAt: Timestamp | null;
}

/** Provisional (Phase 4): one chapter of a path, which is one topic. */
export interface PathProgressRow {
  topicId: string;
  categoryId: string;
  completedAt: Timestamp | null;
  bossAttempts: { ts: Timestamp; correct: number; total: number; won: boolean }[];
}
