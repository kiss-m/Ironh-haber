import type { AttributeCode } from '../../../shared/taxonomy.ts';

/**
 * The colour of each attribute as a background class. Tailwind only generates classes it finds
 * written out in full, so they are spelled out here instead of being built from the code.
 */
export const ATTRIBUTE_SWATCH: Record<AttributeCode, string> = {
  T: 'bg-attr-t',
  R: 'bg-attr-r',
  B: 'bg-attr-b',
  M: 'bg-attr-m',
  W: 'bg-attr-w',
  J: 'bg-attr-j',
};
