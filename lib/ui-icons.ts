/**
 * Interface icons: the tab bar, the profile header and the map filter.
 *
 * These are not emotions and must never be drawn as teardrops. A teardrop that
 * means "calendar" says nothing. They are plain outline glyphs from Lucide
 * (ISC licensed), on a 24x24 grid with a 2 unit stroke, which is what keeps
 * them readable at the 20pt the tab bar uses. The emotion artwork cannot
 * survive that size, which is exactly why the two sets are separate.
 *
 * Shapes are stored rather than raw SVG so no transformer or Metro config is
 * needed: 'd' is a path, 'c' is [cx, cy, r], 'r' is [x, y, w, h, rx].
 */

export type UiShape = { d: string } | { c: number[] } | { r: number[] };

/** Every icon is authored on this grid. */
export const UI_VIEWBOX = '0 0 24 24';

export const UI_ICONS: Record<string, UiShape[]> = {
  globe: [
    { c: [12, 12, 10] },
    { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' },
    { d: 'M2 12h20' },
  ],
  list: [
    { d: 'M3 5h.01' },
    { d: 'M3 12h.01' },
    { d: 'M3 19h.01' },
    { d: 'M8 5h13' },
    { d: 'M8 12h13' },
    { d: 'M8 19h13' },
  ],
  user: [
    { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' },
    { c: [12, 7, 4] },
  ],
  users: [
    { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { d: 'M16 3.128a4 4 0 0 1 0 7.744' },
    { d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { c: [9, 7, 4] },
  ],
  bell: [
    { d: 'M10.268 21a2 2 0 0 0 3.464 0' },
    { d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326' },
  ],
  settings: [
    { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' },
    { c: [12, 12, 3] },
  ],
  calendar: [
    { d: 'M8 2v3' },
    { d: 'M16 2v3' },
    { r: [3, 3, 18, 18, 2] },
    { d: 'M3 9h18' },
  ],
  pencil: [
    { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' },
    { d: 'm15 5 4 4' },
  ],
  chartColumn: [
    { d: 'M3 3v16a2 2 0 0 0 2 2h16' },
    { d: 'M18 17V9' },
    { d: 'M13 17V5' },
    { d: 'M8 17v-3' },
  ],
};
