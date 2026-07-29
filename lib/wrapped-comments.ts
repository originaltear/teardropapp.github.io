/**
 * lib/wrapped-comments.ts — the voice of "Your Year in Tears".
 *
 * Each card gets one witty line, picked from a bank that matches the user's
 * actual numbers (so a 4-cry year and a 300-cry year never read the same). The
 * pick is *seeded* on userId + year + cardId, which means:
 *   - the same person sees the same line every time they reopen their recap
 *     (important — the card gets screenshotted and shared)
 *   - two people with identical stats still tend to get different lines
 *
 * Tone: warm and funny, never mocking. People log real pain here.
 * All copy is English — the app is English-only.
 */

// ─── Seeded pick ──────────────────────────────────────────────────────────────

/** Small, stable string hash (djb2). Deterministic across sessions/devices. */
function hash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pick(bank: string[], seed: string): string {
  if (bank.length === 0) return '';
  return bank[hash(seed) % bank.length];
}

// ─── Banks ────────────────────────────────────────────────────────────────────

const TOTAL_BANK: Record<string, string[]> = {
  few: [
    'A quiet year. We respect the restraint.',
    'Not many — but every one of them counted.',
    'You kept it brief this year.',
  ],
  some: [
    'A steady year of feeling things.',
    'Enough to notice a pattern forming.',
    'You showed up for yourself this often.',
  ],
  many: [
    'That is a lot of feelings. Genuinely.',
    'You went through it — and you logged it.',
    'A full year, heavy in places.',
  ],
  epic: [
    'Frankly, an extraordinary amount of crying.',
    'The tear ducts worked overtime this year.',
    'At this point it is less a habit and more a lifestyle.',
  ],
};

const EMOTION_BANK: Record<string, string[]> = {
  joy: ['Happy tears counted too. Good year.', 'Crying because it was good, actually.'],
  rage: ['Anger was the loudest voice this year.', 'A lot of that was pure fury. Valid.'],
  anxiety: ['Your nervous system had opinions.', 'Anxiety took the wheel more than once.'],
  heartbreak: ['This year had a name attached to it.', 'Heartbreak led the way. That is a hard one.'],
  bittersweet: ['Mostly the good-and-sad kind.', 'Bittersweet — the most honest emotion there is.'],
  exhausted: ['Tired. Just deeply, deeply tired.', 'Exhaustion was the theme. Please rest.'],
  relief: ['Mostly the letting-go kind. That is growth.', 'Relief tears — the best kind of crying.'],
  overwhelmed: ['It was a lot. You said so, often.', 'Overwhelmed was the word of the year.'],
  mixed: ['Too complicated to name. Fair enough.', 'A bit of everything, all at once.'],
  idk: ['Sometimes there is no word for it.', 'Unnamed, but still felt. That counts.'],
  _default: ['This one showed up more than any other.', 'The feeling that defined your year.'],
};

const TIME_BANK: Record<string, string[]> = {
  night: [
    'Certified night crier. The 3am club.',
    'The world was asleep. You were not.',
    'Darkness brought it out of you.',
  ],
  morning: [
    'Starting the day with feelings. Bold.',
    'Mornings hit you the hardest.',
    'Awake, and immediately emotional.',
  ],
  afternoon: [
    'Right in the middle of the day. No warning.',
    'Afternoons: productive, and also devastating.',
  ],
  evening: [
    'The day ended, and it all caught up.',
    'Evenings were when it landed.',
  ],
};

const STREAK_BANK: Record<string, string[]> = {
  none: ['No streaks — you took your breaks.'],
  short: ['A few days in a row. Rough patch, survived.'],
  medium: ['A properly difficult stretch. You got through it.'],
  long: ['That is a long run of hard days. Real endurance.'],
};

const GEO_BANK: Record<string, string[]> = {
  one: ['All in one place. Home turf.'],
  couple: ['You cried in more than one country. Well travelled.'],
  many: ['An international operation at this point.'],
};

const CLOSING_BANK: string[] = [
  'Here is to feeling everything next year too.',
  'You felt it all. That is not nothing.',
  'Still here. Still feeling. See you next year.',
  'Whatever next year brings, you have the map for it.',
];

// ─── Bucketing ────────────────────────────────────────────────────────────────

function totalBucket(total: number): string {
  if (total < 10) return 'few';
  if (total < 50) return 'some';
  if (total < 150) return 'many';
  return 'epic';
}

function streakBucket(streak: number): string {
  if (streak <= 1) return 'none';
  if (streak <= 3) return 'short';
  if (streak <= 7) return 'medium';
  return 'long';
}

function geoBucket(countries: number): string {
  if (countries <= 1) return 'one';
  if (countries <= 3) return 'couple';
  return 'many';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CommentSeed {
  userId: string;
  year: number;
}

const seedFor = (s: CommentSeed, cardId: string) => `${s.userId}:${s.year}:${cardId}`;

export function totalComment(total: number, seed: CommentSeed): string {
  return pick(TOTAL_BANK[totalBucket(total)], seedFor(seed, 'total'));
}

export function emotionComment(emotionId: string | null, seed: CommentSeed): string {
  const bank = (emotionId && EMOTION_BANK[emotionId]) || EMOTION_BANK._default;
  return pick(bank, seedFor(seed, 'emotion'));
}

export function timeComment(bucketId: string | null, seed: CommentSeed): string {
  const bank = (bucketId && TIME_BANK[bucketId]) || TIME_BANK.evening;
  return pick(bank, seedFor(seed, 'time'));
}

export function streakComment(streak: number, seed: CommentSeed): string {
  return pick(STREAK_BANK[streakBucket(streak)], seedFor(seed, 'streak'));
}

export function geoComment(countryCount: number, seed: CommentSeed): string {
  return pick(GEO_BANK[geoBucket(countryCount)], seedFor(seed, 'geo'));
}

export function closingComment(seed: CommentSeed): string {
  return pick(CLOSING_BANK, seedFor(seed, 'closing'));
}
