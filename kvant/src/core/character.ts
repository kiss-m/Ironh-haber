/** The character: levels and ranks (docs/SPEC.md section 10). Classes arrive in Phase 3. */
import { LEVEL } from './config.ts';

/** XP needed to get from `level` to `level + 1`. */
export function xpToNextLevel(level: number, base: number = LEVEL.characterBase): number {
  return Math.round(base * level ** LEVEL.exponent);
}

export interface LevelProgress {
  /** Starts at 1. */
  level: number;
  /** XP collected since reaching this level. */
  intoLevel: number;
  /** XP this level needs in total. */
  levelSize: number;
}

function progress(totalXp: number, base: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  let levelSize = xpToNextLevel(level, base);
  while (remaining >= levelSize) {
    remaining -= levelSize;
    level += 1;
    levelSize = xpToNextLevel(level, base);
  }
  return { level, intoLevel: remaining, levelSize };
}

/** Level of the character from its total XP. */
export function characterProgress(totalXp: number): LevelProgress {
  return progress(totalXp, LEVEL.characterBase);
}

/** Level of one attribute from the XP earned in it. Attributes level up twice as fast. */
export function attributeProgress(attributeXp: number): LevelProgress {
  return progress(attributeXp, LEVEL.attributeBase);
}

export const RANKS = ['novacik', 'ucen', 'tovaris', 'majster', 'velmajster', 'legenda'] as const;

export type Rank = (typeof RANKS)[number];

/** The first level of each rank, highest first. */
const RANK_FROM_LEVEL: readonly (readonly [level: number, rank: Rank])[] = [
  [50, 'legenda'],
  [35, 'velmajster'],
  [20, 'majster'],
  [10, 'tovaris'],
  [5, 'ucen'],
  [1, 'novacik'],
];

export function rankForLevel(level: number): Rank {
  return RANK_FROM_LEVEL.find(([from]) => level >= from)?.[1] ?? 'novacik';
}
