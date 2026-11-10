import { describe, expect, it } from 'vitest';
import { applyAffinity } from './affinity.ts';

describe('applyAffinity', () => {
  it('moves by the amounts of the spec', () => {
    expect(applyAffinity(1, 'like')).toBe(1.15);
    expect(applyAffinity(1, 'bookmark')).toBe(1.1);
    expect(applyAffinity(1, 'known')).toBe(0.95);
    expect(applyAffinity(1, 'quickSkip')).toBe(0.97);
  });

  it('undoes a like or a bookmark that is taken back', () => {
    expect(applyAffinity(applyAffinity(1, 'like'), 'unlike')).toBe(1);
    expect(applyAffinity(applyAffinity(1.3, 'bookmark'), 'unbookmark')).toBe(1.3);
  });

  it('stays within 0.5 and 2.0', () => {
    expect(applyAffinity(1.95, 'like')).toBe(2);
    expect(applyAffinity(2, 'bookmark')).toBe(2);
    expect(applyAffinity(0.52, 'known')).toBe(0.5);
    expect(applyAffinity(0.5, 'quickSkip')).toBe(0.5);
  });

  it('does not accumulate floating-point dust', () => {
    let affinity = 1;
    for (let i = 0; i < 5; i += 1) affinity = applyAffinity(affinity, 'quickSkip');
    expect(affinity).toBe(0.85);
  });
});
