/**
 * The type scale.
 *
 * Before this there were 31 different font sizes across the app, and the four
 * most common were 12, 13, 14 and 15 — 248 uses spread over four sizes that do
 * the same job. Nothing lined up optically, which is the kind of thing nobody
 * notices deliberately and everybody feels.
 *
 * Six steps, each far enough from the next to be a decision rather than an
 * accident. If a new piece of text doesn't obviously fit one of them, the
 * answer is almost always that it belongs to one of them anyway.
 *
 * Deliberately NOT covered: emoji and icon sizing. Values like `emoji: 48` or
 * `bigNumber: 92` are artwork, not typography, and forcing them onto a text
 * ladder would be a category error. Leave them as literal numbers.
 */
export const type = {
  /** Timestamps, tiny meta labels. Rare on purpose — small text is a cost. */
  micro: 11,
  /** Secondary text: handles, hints, counts, the line under a label. */
  caption: 13,
  /** Default body text. Most things are this. */
  body: 15,
  /** Row labels, emphasis inside a list, sheet titles. */
  subhead: 17,
  /** Screen and section titles. */
  title: 20,
  /** The one big number or heading on a screen. */
  heading: 24,
} as const;

export type TypeStep = keyof typeof type;
