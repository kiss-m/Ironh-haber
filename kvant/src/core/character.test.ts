import { describe, expect, it } from 'vitest';
import {
  RANKS,
  attributeProgress,
  characterProgress,
  rankForLevel,
  xpToNextLevel,
  type Rank,
} from './character.ts';

describe('xpToNextLevel', () => {
  it('follows round(60 × n^1.5) for the character', () => {
    expect([1, 2, 3, 4, 5, 9, 10, 20].map((level) => xpToNextLevel(level))).toEqual([
      60, 170, 312, 480, 671, 1620, 1897, 5367,
    ]);
  });

  it('follows round(30 × n^1.5) for attributes', () => {
    expect([1, 2, 3, 4].map((level) => xpToNextLevel(level, 30))).toEqual([30, 85, 156, 240]);
  });
});

describe('characterProgress', () => {
  it('starts at level 1 with nothing collected', () => {
    expect(characterProgress(0)).toEqual({ level: 1, intoLevel: 0, levelSize: 60 });
  });

  it('levels up exactly when a level is filled', () => {
    expect(characterProgress(59)).toEqual({ level: 1, intoLevel: 59, levelSize: 60 });
    expect(characterProgress(60)).toEqual({ level: 2, intoLevel: 0, levelSize: 170 });
    expect(characterProgress(229)).toEqual({ level: 2, intoLevel: 169, levelSize: 170 });
    expect(characterProgress(230)).toEqual({ level: 3, intoLevel: 0, levelSize: 312 });
  });

  it('reaches level 10 at 6 664 XP, about three weeks of 300 XP days', () => {
    expect(characterProgress(6663).level).toBe(9);
    expect(characterProgress(6664)).toEqual({ level: 10, intoLevel: 0, levelSize: 1897 });
    expect(6664 / 300).toBeGreaterThan(21);
    expect(6664 / 300).toBeLessThan(24);
  });

  it('reaches level 20 after four to five months of 300 XP days', () => {
    let total = 0;
    for (let level = 1; level < 20; level += 1) total += xpToNextLevel(level);
    expect(characterProgress(total).level).toBe(20);
    expect(characterProgress(total - 1).level).toBe(19);
    const days = total / 300;
    expect(days).toBeGreaterThan(4 * 30);
    expect(days).toBeLessThan(5 * 31);
  });

  it('treats negative or fractional XP safely', () => {
    expect(characterProgress(-5)).toEqual({ level: 1, intoLevel: 0, levelSize: 60 });
    expect(characterProgress(60.9)).toEqual({ level: 2, intoLevel: 0, levelSize: 170 });
  });
});

describe('attributeProgress', () => {
  it('levels twice as fast as the character', () => {
    expect(attributeProgress(29)).toEqual({ level: 1, intoLevel: 29, levelSize: 30 });
    expect(attributeProgress(30)).toEqual({ level: 2, intoLevel: 0, levelSize: 85 });
    expect(attributeProgress(115)).toEqual({ level: 3, intoLevel: 0, levelSize: 156 });
  });
});

describe('rankForLevel', () => {
  it('maps levels to the six ranks of the spec', () => {
    const table: [number, Rank][] = [
      [1, 'novacik'],
      [4, 'novacik'],
      [5, 'ucen'],
      [9, 'ucen'],
      [10, 'tovaris'],
      [19, 'tovaris'],
      [20, 'majster'],
      [34, 'majster'],
      [35, 'velmajster'],
      [49, 'velmajster'],
      [50, 'legenda'],
      [120, 'legenda'],
    ];
    for (const [level, rank] of table) expect(rankForLevel(level), `level ${level}`).toBe(rank);
    expect(new Set(table.map(([, rank]) => rank))).toEqual(new Set(RANKS));
  });
});
