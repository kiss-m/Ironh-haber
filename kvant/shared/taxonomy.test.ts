import { describe, expect, it } from 'vitest';
import { isCategoryId } from './ids.ts';
import {
  ATTRIBUTE_CODES,
  CATEGORIES,
  STARTER_CATEGORIES,
  findCategory,
  type AttributeCode,
} from './taxonomy.ts';

function countByAttribute(categories: readonly { attribute: AttributeCode }[]) {
  const counts: Record<AttributeCode, number> = { T: 0, R: 0, B: 0, M: 0, W: 0, J: 0 };
  for (const category of categories) counts[category.attribute] += 1;
  return counts;
}

describe('taxonomy', () => {
  it('has six attributes', () => {
    expect(ATTRIBUTE_CODES).toEqual(['T', 'R', 'B', 'M', 'W', 'J']);
  });

  it('defines the 30 categories of the spec, spread over the attributes', () => {
    expect(CATEGORIES).toHaveLength(30);
    expect(countByAttribute(CATEGORIES)).toEqual({ T: 11, R: 3, B: 4, M: 3, W: 7, J: 2 });
  });

  it('marks the 12 starter categories', () => {
    expect(STARTER_CATEGORIES.map((category) => category.id)).toEqual([
      'matematika',
      'fyzika-mechanika',
      'robotika',
      'automatizacia-plc',
      'digitalne-dvojca',
      'vyrobne-stroje',
      'lean-kvalita',
      'projektovy-manazment',
      'peniaze-podnikanie',
      'psychologia-mozog',
      'ako-veci-funguju',
      'nemcina',
    ]);
    expect(countByAttribute(STARTER_CATEGORIES)).toEqual({ T: 6, R: 2, B: 1, M: 1, W: 1, J: 1 });
  });

  it('uses unique slug ids and non-empty unique names', () => {
    const ids = CATEGORIES.map((category) => category.id);
    const names = CATEGORIES.map((category) => category.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    for (const category of CATEGORIES) {
      expect(isCategoryId(category.id), category.id).toBe(true);
      expect(category.name.trim(), category.id).not.toBe('');
    }
  });

  it('looks a category up by id', () => {
    expect(findCategory('nemcina')).toEqual({
      id: 'nemcina',
      name: 'Nemčina',
      attribute: 'J',
      starter: true,
    });
    expect(findCategory('neexistuje')).toBeUndefined();
  });
});
