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
  const t = raw
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_LEN)
    .trim();
  return t.length > 0 ? t : null;
}
