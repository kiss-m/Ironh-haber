/**
 * Row types of the `kvant` IndexedDB database (docs/SPEC.md section 6).
 *
 * Only keys and indexes are fixed by the Dexie schema in db.ts. Other fields can gain members
 * without a schema version bump, so the shapes marked "provisional" below belong to features that
 * arrive in later phases and may still change before any data is written.
 */
import type { BuiltCard, Category, Topic } from '../../shared/schema.ts';
import type { AttributeCode } from '../../shared/taxonomy.ts';
import type { LearningDay } from '../core/day.ts';
import type { DifficultyState } from '../core/difficulty.ts';
import type { Grade, SrsRecord } from '../core/srs.ts';

export type { LearningDay };

/** Epoch milliseconds. Every stored instant uses this, so indexes sort chronologically. */
export type Timestamp = number;

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
  /**
   * The FSRS schedule (src/core/srs.ts), created by the first exposure. `srs.due` is indexed:
   * it is the start of the learning day on which the card is due.
   */
  srs: SrsRecord | null;
  /** Once set the card stays in the Collection. */
  masteredAt: Timestamp | null;
  /** When the card was last answered, graded or not. Decides "not tested today". */
  lastAnsweredAt: Timestamp | null;
}

/** Where a rating came from. */
export type ReviewMode = 'feed' | 'review' | 'boss';

/** One FSRS rating. Answers to cards on their first showing are not ratings and are not logged. */
export interface ReviewLogRow {
  /** Auto-incremented. */
  id: number;
  cardId: string;
  ts: Timestamp;
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. */
  rating: Grade;
  mode: ReviewMode;
  responseMs: number;
}

export type EventType =
  | 'card_seen'
  | 'card_read'
  | 'answer'
  | 'like'
  | 'bookmark'
  | 'known'
  | 'not_understood'
  | 'flag'
  | 'quick_skip'
  | 'goal_met'
  | 'level_up';

export interface EventRow {
  /** Auto-incremented. */
  id: number;
  ts: Timestamp;
  learningDay: LearningDay;
  type: EventType;
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
  /** Cards worked through: read for at least 3 s, acted on, or answered. Counts toward the goal. */
  cardsSeen: number;
  /** Cards shown for the first time, read or not. Counts toward the daily cap on new cards. */
  newCards: number;
  /**
   * Those of `cardsSeen` that were new. A new card the reader swiped past is in `newCards` only,
   * so this is the number a summary can call "of which new".
   */
  newCardsRead: number;
  answers: number;
  correct: number;
  /** Correct answers in a row at this moment. Decides the XP multiplier. */
  correctStreak: number;
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

/** The adaptive difficulty target of one category (src/core/difficulty.ts). */
export interface CategoryDifficultyRow extends DifficultyState {
  categoryId: string;
}

export interface SettingsRow {
  id: 'me';
  /** categoryId → weight 0–100. A category that is missing or zero is not selected. */
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
