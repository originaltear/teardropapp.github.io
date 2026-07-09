/**
 * Cry tags — short labels like "work" or "breakup" attached to a cry.
 * Free text with preset suggestions; limits mirror the DB constraint
 * (valid_tags: max 5 tags, each ≤ 24 chars).
 */

export const MAX_TAGS = 5;
export const MAX_TAG_LEN = 24;

/** Suggested tags shown as chips in the log screen (free text also allowed). */
export const PRESET_TAGS = [
  'family', 'friends', 'love', 'breakup',
  'school', 'work', 'money', 'health',
  'stress', 'grief', 'loneliness', 'homesick',
  'movies', 'music', 'happy tears', 'tired',
];

/**
 * Normalizes raw tag input: lowercase, trimmed, single spaces, no leading #.
 * Returns null when nothing usable remains.
 */
export function normalizeTag(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Truncate by characters, not UTF-16 units — String.slice can cut an emoji
  // in half and leave a corrupted lone surrogate in the saved tag.
  const t = Array.from(cleaned).slice(0, MAX_TAG_LEN).join('').trim();
  return t.length > 0 ? t : null;
}
