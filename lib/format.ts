/**
 * lib/format.ts — shared date formatting.
 *
 * Previously each screen re-implemented these (with small inconsistencies).
 * Centralised here so "5m ago" and "5 June 2026 · 14:30" look the same
 * everywhere.
 */

// The app is English, so dates and times are always formatted in English, but
// in the shape the phone is set to: an American phone gets "June 5, 2026 · 2:30 PM",
// everyone else "5 June 2026 · 14:30". Read once by formatting a known moment
// with the device's own locale; no native module needed.
const probe = new Date(2020, 11, 31, 13, 0);
const uses12h = !/13/.test(probe.toLocaleTimeString(undefined, { hour: 'numeric' }));
const monthFirst = /^\D*12\D/.test(probe.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' }));

/** Locale for times: 12-hour clock where the phone uses one. */
export const TIME_LOCALE = uses12h ? 'en-US' : 'en-GB';
/** Locale for dates: month before day where the phone puts it first. */
export const DATE_LOCALE = monthFirst ? 'en-US' : 'en-GB';

/** "14:30" or "2:30 PM", following the phone. */
export function clockTime(d: Date): string {
  return d.toLocaleTimeString(TIME_LOCALE, { hour: uses12h ? 'numeric' : '2-digit', minute: '2-digit' });
}

/** Relative time: "Just now", "5m ago", "3h ago", "2d ago", then a short date. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(DATE_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Full date + time: "5 June 2026 · 14:30". */
export function fullDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(DATE_LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' +
    clockTime(d)
  );
}

/**
 * "2026-10-09" for the day this moment fell on where the phone is.
 *
 * The ISO string's own first ten characters are the UTC date, which in Denmark
 * puts anything logged between midnight and two in the morning on the day
 * before, and made the calendar mark yesterday as today for the same hours.
 */
export function localDayKey(at: Date | string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
