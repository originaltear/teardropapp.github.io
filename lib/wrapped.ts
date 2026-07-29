/**
 * lib/wrapped.ts — "Your Year in Tears" data engine.
 *
 * Computes a year's worth of stats from the user's own cries. Pure and
 * synchronous: same inputs → same output, no network, easy to test. Server-side
 * extras (hugs received, achievements earned) are fetched separately by
 * getWrappedExtras() so the core computation stays offline-capable.
 *
 * Everything here is aggregate-only — counts, labels and percentages. Notes,
 * coordinates and media never enter WrappedData, because the whole point of the
 * feature is a card the user can safely share publicly.
 */

import { supabase } from './supabase';
import { EMOTIONS, emotionById, type Emotion } from './emotions';
import type { Cry } from './storage';

// Below this a recap is just sad rather than fun — the UI shows a "come back
// later" state instead.
export const MIN_CRIES_FOR_WRAPPED = 3;

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Time-of-day buckets, in display order. `from`/`to` are inclusive hours. */
const TIME_BUCKETS = [
  { id: 'night',     label: 'Late night', emoji: '🌙', from: 0,  to: 5  },
  { id: 'morning',   label: 'Morning',    emoji: '🌅', from: 6,  to: 11 },
  { id: 'afternoon', label: 'Afternoon',  emoji: '☀️', from: 12, to: 17 },
  { id: 'evening',   label: 'Evening',    emoji: '🌆', from: 18, to: 23 },
] as const;

export type TimeBucketId = typeof TIME_BUCKETS[number]['id'];

export interface EmotionSlice {
  id: string;
  label: string;
  emoji: string;
  color: string;
  count: number;
  /** 0–100, rounded. */
  pct: number;
}

export interface WrappedData {
  year: number;
  total: number;
  /** False when there's too little data to build a meaningful recap. */
  hasEnough: boolean;

  topEmotion: EmotionSlice | null;
  /** Every emotion used this year, most-used first. */
  spectrum: EmotionSlice[];

  timeOfDay: {
    buckets: { id: TimeBucketId; label: string; emoji: string; count: number; pct: number }[];
    dominant: { id: TimeBucketId; label: string; emoji: string; count: number; pct: number } | null;
    /** 0–23, the single hour with the most cries. */
    peakHour: number | null;
  };

  busiestMonth: { label: string; count: number } | null;
  /** All 12 months of the year, January-first, for the bar chart. */
  monthly: { label: string; short: string; value: number }[];

  countries: { name: string; count: number }[];
  longestStreak: number;
  avgIntensity: number;
  withPhoto: number;
  withAudio: number;
  topTags: { tag: string; count: number }[];

  /** ISO dates of the first and last cry of the year. */
  firstCry: string | null;
  lastCry: string | null;
}

/** Extras that live on the server rather than in local cry rows. */
export interface WrappedExtras {
  hugsReceived: number;
  likesReceived: number;
  achievementsUnlocked: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const localDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA'); // YYYY-MM-DD

function toSlice(emotion: Emotion, count: number, total: number): EmotionSlice {
  return {
    id: emotion.id,
    label: emotion.label,
    emoji: emotion.emoji,
    color: emotion.color,
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
  };
}

/** Longest run of consecutive days that contain at least one cry. */
function computeLongestStreak(cries: Cry[]): number {
  const days = [...new Set(cries.map(c => localDay(c.createdAt)))].sort();
  if (days.length === 0) return 0;

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round(
      (new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86_400_000,
    );
    if (diff === 1) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  return longest;
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Builds the recap for one calendar year. Pass the user's full cry list — the
 * year filter happens here so callers don't have to duplicate it.
 */
export function computeWrapped(allCries: Cry[], year: number): WrappedData {
  const cries = allCries.filter(c => new Date(c.createdAt).getFullYear() === year);
  const total = cries.length;

  const empty: WrappedData = {
    year,
    total,
    hasEnough: total >= MIN_CRIES_FOR_WRAPPED,
    topEmotion: null,
    spectrum: [],
    timeOfDay: {
      buckets: TIME_BUCKETS.map(b => ({ id: b.id, label: b.label, emoji: b.emoji, count: 0, pct: 0 })),
      dominant: null,
      peakHour: null,
    },
    busiestMonth: null,
    monthly: MONTH_LABELS.map(label => ({ label, short: label.slice(0, 3), value: 0 })),
    countries: [],
    longestStreak: 0,
    avgIntensity: 0,
    withPhoto: 0,
    withAudio: 0,
    topTags: [],
    firstCry: null,
    lastCry: null,
  };
  if (total === 0) return empty;

  // ── Emotions ──
  const emotionCounts: Record<string, number> = {};
  for (const c of cries) emotionCounts[c.emotion] = (emotionCounts[c.emotion] ?? 0) + 1;

  const spectrum = EMOTIONS
    .filter(e => emotionCounts[e.id])
    .map(e => toSlice(e, emotionCounts[e.id], total))
    .sort((a, b) => b.count - a.count);

  // ── Time of day ──
  const byHour = Array<number>(24).fill(0);
  for (const c of cries) byHour[new Date(c.createdAt).getHours()] += 1;

  const buckets = TIME_BUCKETS.map(b => {
    let count = 0;
    for (let h = b.from; h <= b.to; h++) count += byHour[h];
    return {
      id: b.id, label: b.label, emoji: b.emoji, count,
      pct: Math.round((count / total) * 100),
    };
  });
  const dominant = [...buckets].sort((a, b) => b.count - a.count)[0] ?? null;
  const peakHour = byHour.some(v => v > 0)
    ? byHour.indexOf(Math.max(...byHour))
    : null;

  // ── Months ──
  const byMonth = Array<number>(12).fill(0);
  for (const c of cries) byMonth[new Date(c.createdAt).getMonth()] += 1;
  const monthly = MONTH_LABELS.map((label, i) => ({
    label, short: label.slice(0, 3), value: byMonth[i],
  }));
  const busiestIdx = byMonth.indexOf(Math.max(...byMonth));
  const busiestMonth = byMonth[busiestIdx] > 0
    ? { label: MONTH_LABELS[busiestIdx], count: byMonth[busiestIdx] }
    : null;

  // ── Geography ──
  const countryCounts: Record<string, number> = {};
  for (const c of cries) {
    if (c.country) countryCounts[c.country] = (countryCounts[c.country] ?? 0) + 1;
  }
  const countries = Object.entries(countryCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // ── Tags ──
  const tagCounts: Record<string, number> = {};
  for (const c of cries) {
    for (const t of c.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  }
  const topTags = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Misc ──
  const sorted = [...cries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    year,
    total,
    hasEnough: total >= MIN_CRIES_FOR_WRAPPED,
    topEmotion: spectrum[0] ?? null,
    spectrum,
    timeOfDay: { buckets, dominant, peakHour },
    busiestMonth,
    monthly,
    countries,
    longestStreak: computeLongestStreak(cries),
    avgIntensity: Math.round((cries.reduce((s, c) => s + c.intensity, 0) / total) * 10) / 10,
    withPhoto: cries.filter(c => c.photoUri).length,
    withAudio: cries.filter(c => c.audioUri).length,
    topTags,
    firstCry: sorted[0]?.createdAt ?? null,
    lastCry: sorted[sorted.length - 1]?.createdAt ?? null,
  };
}

// ─── Server-side extras ───────────────────────────────────────────────────────

/**
 * Hugs/likes received on this year's cries + achievements unlocked this year.
 * Best-effort: any failure returns zeros so the recap still renders offline.
 */
export async function getWrappedExtras(year: number): Promise<WrappedExtras> {
  const zero: WrappedExtras = { hugsReceived: 0, likesReceived: 0, achievementsUnlocked: 0 };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return zero;

    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;

    // Own cries for the year — engagement counts are read from the view so the
    // numbers match what the rest of the app shows.
    const { data: cryRows } = await supabase
      .from('cries')
      .select('id')
      .eq('user_id', session.user.id)
      .gte('created_at', from)
      .lt('created_at', to);

    const cryIds = (cryRows ?? []).map(r => r.id);

    const [engagementRes, achievementsRes] = await Promise.all([
      cryIds.length
        ? supabase.from('cry_engagement').select('like_count, hug_count').in('cry_id', cryIds)
        : Promise.resolve({ data: [] as { like_count: number; hug_count: number }[] }),
      supabase
        .from('achievements_unlocked')
        .select('achievement_id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('unlocked_at', from)
        .lt('unlocked_at', to),
    ]);

    let hugsReceived = 0;
    let likesReceived = 0;
    for (const row of engagementRes.data ?? []) {
      hugsReceived += row.hug_count ?? 0;
      likesReceived += row.like_count ?? 0;
    }

    return {
      hugsReceived,
      likesReceived,
      achievementsUnlocked: (achievementsRes as any).count ?? 0,
    };
  } catch (e) {
    console.warn('[wrapped] extras failed:', e);
    return zero;
  }
}

// ─── Availability ─────────────────────────────────────────────────────────────

/**
 * Remote kill-switch. The recap ships dark and is turned on from the
 * `app_config.wrapped_enabled` flag — no new build needed to launch it in
 * December. Defaults to false so a failed lookup never leaks the feature early.
 */
export async function isWrappedEnabled(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('app_config')
      .select('wrapped_enabled')
      .eq('id', 1)
      .single();
    return data?.wrapped_enabled === true;
  } catch {
    return false;
  }
}

/** The year the recap covers — the current year. */
export function currentWrappedYear(): number {
  return new Date().getFullYear();
}

export { TIME_BUCKETS, MONTH_LABELS };
