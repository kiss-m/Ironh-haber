/**
 * The `kvant` IndexedDB database.
 *
 * Other apps are served from the same origin, so this is the only database Kvant ever opens,
 * and nothing here may list, read or delete databases that are not its own.
 */
import Dexie, { type EntityTable, type Table } from 'dexie';
import type {
  AchievementRow,
  CardRow,
  CardStateRow,
  CategoryDifficultyRow,
  CategoryRow,
  CharacterRow,
  ContentMetaRow,
  DailyRow,
  EventRow,
  LearningDay,
  PathProgressRow,
  ReviewLogRow,
  SettingsRow,
  TopicAffinityRow,
  TopicRow,
} from './types.ts';

export const DB_NAME = 'kvant';

/** Tables filled from content packs. The importer replaces them; a backup leaves them out. */
export const CONTENT_TABLES = ['categories', 'topics', 'cards', 'contentMeta'] as const;

/** Tables holding what the user did. The importer never touches them; a backup exports them. */
export const USER_TABLES = [
  'cardState',
  'reviewLog',
  'events',
  'daily',
  'character',
  'topicAffinity',
  'categoryDifficulty',
  'settings',
  'achievements',
  'pathProgress',
] as const;

/**
 * Schema version 1: the primary key first, then the indexes.
 *
 * Booleans cannot be IndexedDB keys, so flags such as `bookmarked` or `archived` are filtered in
 * memory. A row whose indexed value is null (`srs`, `masteredAt`) is simply absent from that
 * index, which keeps both indexes small.
 *
 * Never edit a version that has shipped. To change keys or indexes add
 * `db.version(2).stores({ ... }).upgrade(...)` below it.
 */
const SCHEMA_V1 = {
  categories: 'id, attribute',
  topics: 'id, categoryId',
  // [topicId+order] reads a topic's cards in order and also serves lookups by topicId alone.
  cards: 'id, [topicId+order], categoryId',
  contentMeta: 'packId',

  // srs.due finds due reviews, lastSeenAt the recently seen, masteredAt the Collection.
  cardState: 'cardId, srs.due, lastSeenAt, masteredAt',
  reviewLog: '++id, cardId, ts',
  events: '++id, learningDay, type',
  daily: 'learningDay',
  character: 'id',
  topicAffinity: 'topicId',
  categoryDifficulty: 'categoryId',
  settings: 'id',
  achievements: 'id',
  pathProgress: 'topicId, categoryId',
} satisfies Record<(typeof CONTENT_TABLES)[number] | (typeof USER_TABLES)[number], string>;

export type KvantDb = Dexie & {
  categories: Table<CategoryRow, string>;
  topics: Table<TopicRow, string>;
  cards: Table<CardRow, string>;
  contentMeta: Table<ContentMetaRow, string>;

  cardState: Table<CardStateRow, string>;
  reviewLog: EntityTable<ReviewLogRow, 'id'>;
  events: EntityTable<EventRow, 'id'>;
  daily: Table<DailyRow, LearningDay>;
  character: Table<CharacterRow, 'me'>;
  topicAffinity: Table<TopicAffinityRow, string>;
  categoryDifficulty: Table<CategoryDifficultyRow, string>;
  settings: Table<SettingsRow, 'me'>;
  achievements: Table<AchievementRow, string>;
  pathProgress: Table<PathProgressRow, string>;
};

/** Declares the schema without opening the database. Tests pass their own name. */
export function createDb(name: string = DB_NAME): KvantDb {
  const database = new Dexie(name) as KvantDb;
  database.version(1).stores(SCHEMA_V1);
  return database;
}

/** The app's database. Dexie opens it on the first query. */
export const db = createDb();
