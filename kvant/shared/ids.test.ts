import { describe, expect, it } from 'vitest';
import { categoryIdOf, isCardId, isCategoryId, isTopicId, topicIdOf } from './ids.ts';

describe('id formats', () => {
  it('accepts lowercase slugs as category ids', () => {
    for (const id of ['robotika', 'fyzika-mechanika', 'programovanie-data-ai', '5s']) {
      expect(isCategoryId(id), id).toBe(true);
    }
  });

  it('rejects anything that is not a lowercase ASCII slug', () => {
    for (const id of ['', 'Robotika', 'štíhla-výroba', 'a b', 'a_b', '-a', 'a-', 'a--b', 'a.b']) {
      expect(isCategoryId(id), id).toBe(false);
    }
  });

  it('expects two segments in a topic id and three in a card id', () => {
    expect(isTopicId('robotika.kinematika')).toBe(true);
    expect(isTopicId('robotika')).toBe(false);
    expect(isTopicId('robotika.kinematika.dh-parametre')).toBe(false);
    expect(isTopicId('robotika.')).toBe(false);

    expect(isCardId('robotika.kinematika.dh-parametre')).toBe(true);
    expect(isCardId('robotika.kinematika')).toBe(false);
    expect(isCardId('robotika.kinematika.dh.parametre')).toBe(false);
    expect(isCardId('robotika..dh-parametre')).toBe(false);
  });
});

describe('id parts', () => {
  it('reads the category from a topic id or a card id', () => {
    expect(categoryIdOf('robotika.kinematika')).toBe('robotika');
    expect(categoryIdOf('fyzika-mechanika.statika.moment-sily')).toBe('fyzika-mechanika');
    expect(categoryIdOf('robotika')).toBe('robotika');
  });

  it('reads the topic from a card id', () => {
    expect(topicIdOf('robotika.kinematika.dh-parametre')).toBe('robotika.kinematika');
    expect(topicIdOf('nemcina.vyroba.spindel')).toBe('nemcina.vyroba');
  });
});
