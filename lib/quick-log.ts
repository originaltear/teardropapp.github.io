/**
 * Quick-log detection — the single source of truth for what counts as a
 * "quick log": a cry with emotion + location only, no details added yet.
 * Used by the My Cries and Feed "Mine" filters and their row badges.
 */
import type { Cry } from './storage';
import type { SocialCry } from './social';

function isBare(
  note?: string | null,
  photo?: string | null,
  audio?: string | null,
  tags?: string[] | null,
): boolean {
  return !note && !photo && !audio && !(tags && tags.length > 0);
}

/** Local/own cry shape (lib/storage). */
export function isQuickLog(c: Cry): boolean {
  return isBare(c.note, c.photoUri, c.audioUri, c.tags);
}

/** Server cry shape (lib/social). */
export function isQuickLogSocial(c: SocialCry): boolean {
  return isBare(c.note, c.photo_uri, c.audio_uri, c.tags);
}
