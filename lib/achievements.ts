/**
 * Phase 5A — Full achievement system.
 * Checks conditions locally (cries data) and remotely (Supabase social data).
 * Saves newly unlocked achievements to Supabase.
 */
import { supabase } from './supabase';
import { Cry } from './storage';
import type { Session } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  title: string;
  emoji: string;
  unlockMessage: string;
  isTear: boolean;       // whether unlocking this earns a Tear emblem
  tearEmoji?: string;    // the tear emoji (if isTear)
  category: 'quantity' | 'timing' | 'geography' | 'emotion' | 'streak' | 'media' | 'social' | 'profile' | 'quirky';
}

// ─── Tear definitions ─────────────────────────────────────────────────────────

export interface TearDef {
  emoji: string;
  name: string;
  description: string;
  achievementId?: string; // which achievement unlocks it (undefined = special/auto)
}

export const TEARS: TearDef[] = [
  { emoji: '💎', name: 'Crystal Tear', description: 'Premium member' },
  { emoji: '👑', name: 'Founder', description: 'Among the first 100 users', achievementId: 'founder' },
  { emoji: '🌊', name: 'First Wave', description: 'Among the first 1000 users', achievementId: 'first_wave' },
  { emoji: '🌍', name: 'World Tear', description: 'Cried in 5+ countries', achievementId: 'world_tear' },
  { emoji: '🔥', name: 'Burning Tear', description: '30-day streak', achievementId: 'month_streak' },
  { emoji: '🌙', name: 'Midnight Tear', description: 'Cried between midnight and 4am', achievementId: 'midnight_tear' },
];

// ─── Achievement catalogue ────────────────────────────────────────────────────

export const ACHIEVEMENTS: Achievement[] = [
  // ── Quantity ──
  {
    id: 'first_tear', title: 'First Tear', emoji: '💧', category: 'quantity', isTear: false,
    unlockMessage: "And so it begins. Welcome to the club nobody asked to join.",
  },
  {
    id: 'ten_cries', title: 'Getting Good', emoji: '✌️', category: 'quantity', isTear: false,
    unlockMessage: "You're getting the hang of this.",
  },
  {
    id: 'fifty_cries', title: 'Veteran Crier', emoji: '🎖️', category: 'quantity', isTear: false,
    unlockMessage: "Fifty. You're practically a professional at this.",
  },
  {
    id: 'hundred_cries', title: 'Triple Digits', emoji: '💯', category: 'quantity', isTear: false,
    unlockMessage: "Triple digits. Therapists hate this one trick.",
  },
  {
    id: 'five_hundred', title: 'Five Hundred', emoji: '🗂️', category: 'quantity', isTear: false,
    unlockMessage: "Five hundred cries. A whole archive of feeling.",
  },
  {
    id: 'thousand_cries', title: 'One Thousand', emoji: '🏛️', category: 'quantity', isTear: false,
    unlockMessage: "A thousand. This is your life's work.",
  },
  {
    id: 'ugly_cry', title: 'Ugly Cry', emoji: '😭', category: 'quantity', isTear: false,
    unlockMessage: "No half measures. Respect.",
  },
  {
    id: 'single_tear', title: 'A Single Tear', emoji: '😔', category: 'quantity', isTear: false,
    unlockMessage: "Dignified. Controlled. Suspicious.",
  },

  // ── Timing ──
  {
    id: 'midnight_tear', title: 'Midnight Tear', emoji: '🌙', category: 'timing', isTear: true, tearEmoji: '🌙',
    unlockMessage: "The world's asleep. You're out here feeling things. Valid.",
  },
  {
    id: 'monday_blues', title: 'Monday Blues', emoji: '😞', category: 'timing', isTear: false,
    unlockMessage: "Mondays really don't miss, do they.",
  },
  {
    id: 'new_years_cry', title: "New Year's Cry", emoji: '🎆', category: 'timing', isTear: false,
    unlockMessage: "New year, same feelings. Cheers.",
  },
  {
    id: 'lunchtime_crisis', title: 'Lunchtime Crisis', emoji: '🥪', category: 'timing', isTear: false,
    unlockMessage: "Sandwich can wait.",
  },
  {
    id: 'sunday_sadness', title: 'Sunday Sadness', emoji: '😶', category: 'timing', isTear: false,
    unlockMessage: "Ah. The Sunday scaries claimed another one.",
  },
  {
    id: 'valentine_cry', title: 'Valentine Cry', emoji: '💘', category: 'timing', isTear: false,
    unlockMessage: "Ah. February 14th. Of course.",
  },

  // ── Geography ──
  {
    id: 'home_turf', title: 'Home Turf', emoji: '🏠', category: 'geography', isTear: false,
    unlockMessage: "Home sweet home, they say.",
  },
  {
    id: 'city_hopper', title: 'City Hopper', emoji: '🗺️', category: 'geography', isTear: false,
    unlockMessage: "Spreading the tears around. Sharing is caring.",
  },
  {
    id: 'world_tear', title: 'World Tear', emoji: '🌍', category: 'geography', isTear: true, tearEmoji: '🌍',
    unlockMessage: "A true citizen of the world. A crying citizen.",
  },
  {
    id: 'globetrotter', title: 'Globetrotter', emoji: '✈️', category: 'geography', isTear: false,
    unlockMessage: "You've cried on multiple continents. Impressive range.",
  },

  // ── Emotion ──
  {
    id: 'full_spectrum', title: 'Full Spectrum', emoji: '🌈', category: 'emotion', isTear: false,
    unlockMessage: "Congratulations. You contain multitudes.",
  },
  {
    id: 'complex_soul', title: 'Complex Soul', emoji: '🌀', category: 'emotion', isTear: false,
    unlockMessage: "Even you don't know how you feel. Relatable.",
  },
  {
    id: 'drama', title: 'Drama', emoji: '🎭', category: 'emotion', isTear: false,
    unlockMessage: "The rage. The passion. The tears. Shakespearean.",
  },
  {
    id: 'anxious_mind', title: 'Anxious Mind', emoji: '🫨', category: 'emotion', isTear: false,
    unlockMessage: "The mind never rests. Neither do you.",
  },

  // ── Streaks ──
  {
    id: 'week_streak', title: 'Week Streak', emoji: '🔥', category: 'streak', isTear: false,
    unlockMessage: "Seven days. Consistent, if nothing else.",
  },
  {
    id: 'month_streak', title: 'Month Streak', emoji: '🔥', category: 'streak', isTear: true, tearEmoji: '🔥',
    unlockMessage: "Thirty days. At this point it's a lifestyle.",
  },
  {
    id: 'century', title: 'Century', emoji: '💫', category: 'streak', isTear: false,
    unlockMessage: "100 days. This is who you are now.",
  },

  // ── Media ──
  {
    id: 'photographer', title: 'Photographer', emoji: '📷', category: 'media', isTear: false,
    unlockMessage: "Documenting the lows for the scrapbook. Archivist behavior.",
  },
  {
    id: 'voice_notes', title: 'Voice Notes', emoji: '🎙️', category: 'media', isTear: false,
    unlockMessage: "Sometimes you just need to hear yourself cry.",
  },
  {
    id: 'storyteller', title: 'Storyteller', emoji: '📖', category: 'media', isTear: false,
    unlockMessage: "You really committed to this one.",
  },

  // ── Social ──
  {
    id: 'first_like', title: 'First Like', emoji: '💙', category: 'social', isTear: false,
    unlockMessage: "You are seen.",
  },
  {
    id: 'appreciated', title: 'Appreciated', emoji: '🌟', category: 'social', isTear: false,
    unlockMessage: "Fifty people felt that. Felt you.",
  },
  {
    id: 'popular_cry', title: 'Popular Cry', emoji: '🏆', category: 'social', isTear: false,
    unlockMessage: "This one resonated. Must've been a good cry.",
  },
  {
    id: 'listener', title: 'Listener', emoji: '👂', category: 'social', isTear: false,
    unlockMessage: "You showed up for people. That matters.",
  },
  {
    id: 'supportive', title: 'Supportive', emoji: '🤝', category: 'social', isTear: false,
    unlockMessage: "You're the friend everyone needs.",
  },

  // ── Profile ──
  {
    id: 'profile_complete', title: 'Profile Complete', emoji: '✅', category: 'profile', isTear: false,
    unlockMessage: "Now they know who you are. Do you?",
  },
  {
    id: 'veteran', title: 'Veteran', emoji: '🎗️', category: 'profile', isTear: false,
    unlockMessage: "One year of tears. You've grown.",
  },
  {
    id: 'old_timer', title: 'Old Timer', emoji: '🏅', category: 'profile', isTear: false,
    unlockMessage: "Two years. You're basically furniture here. We love you.",
  },

  // ── Special (Founder / First Wave) ──
  {
    id: 'founder', title: 'Founder', emoji: '👑', category: 'profile', isTear: true, tearEmoji: '👑',
    unlockMessage: "You were here before anyone else knew this place existed.",
  },
  {
    id: 'first_wave', title: 'First Wave', emoji: '🌊', category: 'profile', isTear: true, tearEmoji: '🌊',
    unlockMessage: "You caught the wave before it was cool.",
  },

  // ── Quirky ──
  {
    id: 'marathon', title: 'Marathon', emoji: '🏃', category: 'quirky', isTear: false,
    unlockMessage: "Three times in one day. Hope tomorrow is better.",
  },
  {
    id: 'dramatic', title: 'Dramatic', emoji: '🎬', category: 'quirky', isTear: false,
    unlockMessage: "Max intensity plus voice note. A performance.",
  },
  {
    id: 'commuter_cry', title: 'Commuter Cry', emoji: '🚂', category: 'quirky', isTear: false,
    unlockMessage: "Rush hour feelings. No one even noticed.",
  },
];

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeStreak(cries: Cry[]): number {
  if (!cries.length) return 0;
  const days = [...new Set(cries.map(c => c.createdAt.slice(0, 10)))].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (days[0] !== today && days[0] !== yesterday) return 0;
  let s = 1;
  for (let i = 0; i < days.length - 1; i++) {
    const a = new Date(days[i]).getTime(), b = new Date(days[i + 1]).getTime();
    if (Math.round((a - b) / 86_400_000) === 1) s++; else break;
  }
  return s;
}

// ─── Local conditions check ───────────────────────────────────────────────────

function checkLocalConditions(cries: Cry[]): Set<string> {
  const ok = new Set<string>();
  const n = cries.length;

  // Quantity
  if (n >= 1) ok.add('first_tear');
  if (n >= 10) ok.add('ten_cries');
  if (n >= 50) ok.add('fifty_cries');
  if (n >= 100) ok.add('hundred_cries');
  if (n >= 500) ok.add('five_hundred');
  if (n >= 1000) ok.add('thousand_cries');
  if (cries.filter(c => c.intensity === 5).length >= 5) ok.add('ugly_cry');
  if (cries.filter(c => c.intensity === 1).length >= 10) ok.add('single_tear');

  // Timing
  if (cries.some(c => { const h = new Date(c.createdAt).getHours(); return h < 4; }))
    ok.add('midnight_tear');

  const mondayDays = new Set(
    cries.filter(c => new Date(c.createdAt).getDay() === 1).map(c => c.createdAt.slice(0, 10))
  );
  if (mondayDays.size >= 5) ok.add('monday_blues');

  if (cries.some(c => { const d = new Date(c.createdAt); return d.getMonth() === 0 && d.getDate() === 1; }))
    ok.add('new_years_cry');

  if (cries.some(c => {
    const d = new Date(c.createdAt), h = d.getHours(), day = d.getDay();
    return h >= 12 && h < 14 && day >= 1 && day <= 5;
  })) ok.add('lunchtime_crisis');

  const sundayDays = new Set(
    cries.filter(c => new Date(c.createdAt).getDay() === 0).map(c => c.createdAt.slice(0, 10))
  );
  if (sundayDays.size >= 5) ok.add('sunday_sadness');

  if (cries.some(c => { const d = new Date(c.createdAt); return d.getMonth() === 1 && d.getDate() === 14; }))
    ok.add('valentine_cry');

  // Geography — home_turf
  for (const anchor of cries) {
    const nearby = cries.filter(c =>
      haversineM(anchor.latitude, anchor.longitude, c.latitude, c.longitude) <= 100
    );
    if (nearby.length >= 10) { ok.add('home_turf'); break; }
  }

  // Geography — city_hopper (5+ distinct ~11km grid cells)
  const regions = new Set(cries.map(c => `${c.latitude.toFixed(1)},${c.longitude.toFixed(1)}`));
  if (regions.size >= 5) ok.add('city_hopper');

  // Geography — countries
  const countries = new Set(cries.filter(c => c.country).map(c => c.country!));
  if (countries.size >= 5) ok.add('world_tear');
  if (countries.size >= 10) ok.add('globetrotter');

  // Emotion
  const emotions = new Set(cries.map(c => c.emotion));
  if (emotions.size >= 9) ok.add('full_spectrum');
  if (cries.filter(c => c.emotion === 'mixed').length >= 20) ok.add('complex_soul');
  if (cries.filter(c => c.emotion === 'rage').length >= 10) ok.add('drama');
  if (cries.filter(c => c.emotion === 'anxiety').length >= 10) ok.add('anxious_mind');

  // Streak
  const s = computeStreak(cries);
  if (s >= 7) ok.add('week_streak');
  if (s >= 30) ok.add('month_streak');
  if (s >= 100) ok.add('century');

  // Media
  if (cries.filter(c => c.photoUri).length >= 10) ok.add('photographer');
  if (cries.filter(c => c.audioUri).length >= 5) ok.add('voice_notes');
  if (cries.some(c => c.photoUri && c.audioUri && c.note)) ok.add('storyteller');

  // Quirky — marathon (3+ in one day)
  const byDay: Record<string, number> = {};
  for (const c of cries) {
    const d = c.createdAt.slice(0, 10);
    byDay[d] = (byDay[d] ?? 0) + 1;
  }
  if (Object.values(byDay).some(v => v >= 3)) ok.add('marathon');

  // Quirky — dramatic (audio + intensity 5)
  if (cries.some(c => c.audioUri && c.intensity === 5)) ok.add('dramatic');

  // Quirky — commuter_cry (rush hour on weekday)
  if (cries.some(c => {
    const d = new Date(c.createdAt), h = d.getHours(), day = d.getDay();
    return day >= 1 && day <= 5 && ((h >= 7 && h < 9) || (h >= 17 && h < 19));
  })) ok.add('commuter_cry');

  return ok;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getUnlockedAchievements(userId: string): Promise<{ id: string; unlocked_at: string }[]> {
  const { data } = await supabase
    .from('achievements_unlocked')
    .select('achievement_id, unlocked_at')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });
  return (data ?? []).map(r => ({ id: r.achievement_id, unlocked_at: r.unlocked_at }));
}

/**
 * Check all achievements, save new ones to Supabase, and return newly unlocked ones.
 * Call after cry save and on profile load.
 */
export async function checkAndSaveAchievements(
  cries: Cry[],
  session: Session
): Promise<Achievement[]> {
  const userId = session.user.id;

  // Already unlocked
  const already = new Set((await getUnlockedAchievements(userId)).map(a => a.id));

  // Local check
  const toUnlock = new Set(checkLocalConditions(cries));

  // Remote checks (best-effort — don't block on errors)
  try {
    // Profile completeness
    const { data: prof } = await supabase
      .from('profiles')
      .select('display_name, bio, avatar_uri')
      .eq('id', userId)
      .single();
    if (prof?.display_name && prof?.bio && prof?.avatar_uri) toUnlock.add('profile_complete');

    // Account age
    const ageMs = Date.now() - new Date(session.user.created_at).getTime();
    if (ageMs >= 365 * 86400000) toUnlock.add('veteran');
    if (ageMs >= 730 * 86400000) toUnlock.add('old_timer');

    // Founder / First Wave — use auth user's position by checking profiles
    // We use the user's own created_at from auth metadata (more reliable than profiles.created_at)
    try {
      const { count: before } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', session.user.created_at);
      if (before !== null && before < 100) toUnlock.add('founder');
      if (before !== null && before < 1000) toUnlock.add('first_wave');
    } catch { /* profiles may not expose created_at — skip */ }

    // Likes received on own cries
    const { data: ownCries } = await supabase.from('cries').select('id').eq('user_id', userId);
    const ownIds = (ownCries ?? []).map(c => c.id);
    if (ownIds.length > 0) {
      const { data: likeRows } = await supabase.from('likes').select('cry_id').in('cry_id', ownIds);
      const rows = likeRows ?? [];
      if (rows.length >= 1) toUnlock.add('first_like');
      if (rows.length >= 50) toUnlock.add('appreciated');
      const perCry: Record<string, number> = {};
      for (const l of rows) perCry[l.cry_id] = (perCry[l.cry_id] ?? 0) + 1;
      if (Object.values(perCry).some(v => v >= 10)) toUnlock.add('popular_cry');
    }

    // Comments given
    const { count: commentsGiven } = await supabase
      .from('comments').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    if ((commentsGiven ?? 0) >= 50) toUnlock.add('listener');

    // Likes given
    const { count: likesGiven } = await supabase
      .from('likes').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    if ((likesGiven ?? 0) >= 100) toUnlock.add('supportive');
  } catch (e) {
    console.warn('[achievements] remote check error:', e);
  }

  // Filter to only newly unlocked
  const newIds = [...toUnlock].filter(id => !already.has(id));
  if (newIds.length === 0) return [];

  // Save to Supabase
  await supabase.from('achievements_unlocked').insert(
    newIds.map(achievement_id => ({ user_id: userId, achievement_id }))
  ).throwOnError().catch(() => {});

  // Update earned_tears on profiles for tear-bearing achievements
  const newTears = newIds
    .map(id => ACHIEVEMENTS.find(a => a.id === id))
    .filter(a => a?.isTear && a.tearEmoji)
    .map(a => a!.tearEmoji!);

  if (newTears.length > 0) {
    // Fetch current earned_tears first
    const { data: profData } = await supabase
      .from('profiles').select('earned_tears').eq('id', userId).single();
    const current: string[] = profData?.earned_tears ?? [];
    const merged = [...new Set([...current, ...newTears])];
    await supabase.from('profiles').update({ earned_tears: merged }).eq('id', userId);
  }

  return newIds.map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean) as Achievement[];
}

/**
 * Get all earned tears for a user (from achievements + special status).
 */
export async function getEarnedTears(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('profiles').select('earned_tears').eq('id', userId).single();
  return data?.earned_tears ?? [];
}

/**
 * Update which tears the user displays (max 3).
 */
export async function setSelectedTears(userId: string, tears: string[]): Promise<void> {
  await supabase
    .from('profiles')
    .update({ selected_tears: tears.slice(0, 3) })
    .eq('id', userId);
}
