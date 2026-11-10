/**
 * Stable content identifiers.
 *
 *   category  robotika
 *   topic     robotika.kinematika
 *   card      robotika.kinematika.dh-parametre
 *
 * Every segment is a lowercase ASCII slug, so an id is safe in a URL hash, a file name and an
 * IndexedDB key. Ids are permanent: never reuse one for different content. A card that is
 * substantially rewritten gets a new id and the old card is archived.
 */

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

export const SLUG_PATTERN = new RegExp(`^${SLUG}$`);
export const CATEGORY_ID_PATTERN = SLUG_PATTERN;
export const TOPIC_ID_PATTERN = new RegExp(`^${SLUG}\\.${SLUG}$`);
export const CARD_ID_PATTERN = new RegExp(`^${SLUG}\\.${SLUG}\\.${SLUG}$`);

export function isCategoryId(value: string): boolean {
  return CATEGORY_ID_PATTERN.test(value);
}

export function isTopicId(value: string): boolean {
  return TOPIC_ID_PATTERN.test(value);
}

export function isCardId(value: string): boolean {
  return CARD_ID_PATTERN.test(value);
}

/** The category part of a topic id or card id: `robotika.kinematika.x` → `robotika`. */
export function categoryIdOf(topicOrCardId: string): string {
  const dot = topicOrCardId.indexOf('.');
  return dot === -1 ? topicOrCardId : topicOrCardId.slice(0, dot);
}

/** The topic part of a card id: `robotika.kinematika.x` → `robotika.kinematika`. */
export function topicIdOf(cardId: string): string {
  const dot = cardId.lastIndexOf('.');
  return dot === -1 ? cardId : cardId.slice(0, dot);
}
