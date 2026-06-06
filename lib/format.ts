/**
 * lib/format.ts — shared date formatting.
 *
 * Previously each screen re-implemented these (with small inconsistencies).
 * Centralised here so "5m ago" and "5 June 2026 · 14:30" look the same
 * everywhere.
 */

/** Relative time: "Just now", "5m ago", "3h ago", "2d ago", then a short date. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Full date + time: "5 June 2026 · 14:30". */
export function fullDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}
