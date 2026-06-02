/**
 * Statistics screen — /stats
 * Free: summary cards, cries per month, #1 emotion
 * Premium: emotion breakdown, day of week, countries, top likers, active hour, emotion trends
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { loadCries, Cry } from '../lib/storage';
import { EMOTIONS, emotionById } from '../lib/emotions';
import { useAuth } from '../lib/auth';
import { checkPremium } from '../lib/purchases';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/themes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopLiker {
  actor_id: string;
  count: number;
  username: string;
  display_name: string;
  avatar_uri: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Mon-first weekday order (JS getDay: 0=Sun)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function hour12(h: number) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function shortMonthLabel(ym: string) {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1);
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, premium }: { title: string; premium?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <Text style={s.sectionTitle}>{title}</Text>
      {premium && <Text style={s.premiumBadge}>💎</Text>}
    </View>
  );
}

/** Horizontal bar row */
function HBar({ label, value, max, color, labelWidth = 80 }: {
  label: string; value: number; max: number; color?: string; labelWidth?: number;
}) {
  const { theme: { accent } } = useTheme();
  const fillColor = color ?? accent;
  return (
    <View style={hb.row}>
      <Text style={[hb.label, { width: labelWidth }]} numberOfLines={1}>{label}</Text>
      <View style={hb.bg}>
        <View style={[hb.fill, { width: `${Math.max((value / Math.max(max, 1)) * 100, value > 0 ? 2 : 0)}%`, backgroundColor: fillColor }]} />
      </View>
      <Text style={hb.val}>{value}</Text>
    </View>
  );
}
const hb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  label: { color: '#64748b', fontSize: 12, fontFamily: 'monospace', textAlign: 'right' },
  bg: { flex: 1, height: 20, backgroundColor: '#1f2937', borderRadius: 5, overflow: 'hidden' },
  fill: { height: 20, borderRadius: 5, minWidth: 3 },
  val: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace', width: 26, textAlign: 'right' },
});

/** Vertical bar chart for 24 hours */
function HourChart({ buckets }: { buckets: { hour: number; count: number }[] }) {
  const { theme: { accent } } = useTheme();
  const max = Math.max(...buckets.map(b => b.count), 1);
  const peak = buckets.reduce((best, b) => (b.count > best.count ? b : best), { hour: 0, count: 0 });
  return (
    <View>
      {peak.count > 0 && (
        <Text style={s.peakLabel}>
          Peak: <Text style={{ color: accent, fontWeight: '700' }}>{hour12(peak.hour)}</Text>
          {'  '}({peak.count} {peak.count === 1 ? 'cry' : 'cries'})
        </Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 72, gap: 2, marginTop: 8 }}>
        {buckets.map(b => (
          <View key={b.hour} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <View style={{
              width: '80%',
              height: Math.max(b.count > 0 ? 4 : 2, (b.count / max) * 68),
              backgroundColor: b.hour === peak.hour ? accent : '#1f2937',
              borderRadius: 2,
            }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        {[0, 4, 8, 12, 16, 20, 23].map(h => (
          <Text key={h} style={{ color: '#374151', fontSize: 9, fontFamily: 'monospace' }}>
            {hour12(h)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Locked overlay — renders over premium content for free users */
function LockedOverlay({ onPress }: { onPress: () => void }) {
  const { theme: { accent } } = useTheme();
  return (
    <TouchableOpacity
      style={s.lockOverlay}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Text style={{ fontSize: 32, marginBottom: 8 }}>💎</Text>
      <Text style={[s.lockTitle, { color: accent }]}>Unlock with Crystal Tear</Text>
      <Text style={s.lockSub}>Tap to upgrade</Text>
    </TouchableOpacity>
  );
}

/** Section wrapper that dims + locks content for free users */
function PremiumSection({
  isPremium, title, onLockPress, children,
}: {
  isPremium: boolean;
  title: string;
  onLockPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={[s.section, { overflow: 'hidden' }]}>
      <SectionHeader title={title} premium />
      <View style={{ opacity: isPremium ? 1 : 0.12 }}>
        {children}
      </View>
      {!isPremium && <LockedOverlay onPress={onLockPress} />}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { theme: { accent } } = useTheme();

  const [cries, setCries] = useState<Cry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [topLikers, setTopLikers] = useState<TopLiker[]>([]);

  useFocusEffect(useCallback(() => {
    loadAll();
  }, [session]));

  async function loadAll() {
    setLoading(true);
    try {
      const [c, premium] = await Promise.all([loadCries(), checkPremium()]);
      setCries(c);
      setIsPremium(premium);

      if (session) {
        const { data } = await supabase
          .from('notifications')
          .select('actor_id, profile:profiles!notifications_actor_id_fkey(username, display_name, avatar_uri)')
          .eq('user_id', session.user.id)
          .eq('type', 'like');

        if (data) {
          const counts: Record<string, { count: number; username: string; display_name: string; avatar_uri: string | null }> = {};
          for (const row of data) {
            const p = row.profile as any;
            if (!p) continue;
            if (!counts[row.actor_id]) {
              counts[row.actor_id] = { count: 0, username: p.username ?? '', display_name: p.display_name ?? '', avatar_uri: p.avatar_uri ?? null };
            }
            counts[row.actor_id].count++;
          }
          const sorted: TopLiker[] = Object.entries(counts)
            .map(([actor_id, v]) => ({ actor_id, ...v }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
          setTopLikers(sorted);
        }
      }
    } catch (e) {
      console.warn('[stats] loadAll failed:', e);
    } finally {
      setLoading(false);
    }
  }

  const goPaywall = () => router.push('/paywall');
  const n = cries.length;

  // ── Compute all stats (memoized — these are ~15 O(n) passes over `cries`
  //    that would otherwise re-run on every render, e.g. loading/premium state) ──
  const stats = useMemo(() => {
    const now = new Date();

    // Periods
    const todayStr = now.toLocaleDateString('en-CA');
    const wkStart = (() => {
      const d = new Date(now);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Mon-start
      return d.toLocaleDateString('en-CA');
    })();
    const moKey = getMonthKey(now);
    const yr = now.getFullYear();

    const thisWeek  = cries.filter(c => c.createdAt.slice(0, 10) >= wkStart).length;
    const thisMonth = cries.filter(c => getMonthKey(new Date(c.createdAt)) === moKey).length;
    const thisYear  = cries.filter(c => new Date(c.createdAt).getFullYear() === yr).length;

    // Streaks
    const days = [...new Set(cries.map(c => new Date(c.createdAt).toLocaleDateString('en-CA')))].sort().reverse();
    let currentStreak = 0, maxStreak = 0;
    if (days.length > 0) {
      const yestStr = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
      if (days[0] === todayStr || days[0] === yestStr) {
        currentStreak = 1;
        for (let i = 0; i < days.length - 1; i++) {
          const diff = Math.round((new Date(days[i]).getTime() - new Date(days[i + 1]).getTime()) / 86400000);
          if (diff === 1) currentStreak++; else break;
        }
      }
      let streak = 1;
      for (let i = 0; i < days.length - 1; i++) {
        const diff = Math.round((new Date(days[i]).getTime() - new Date(days[i + 1]).getTime()) / 86400000);
        if (diff === 1) { streak++; maxStreak = Math.max(maxStreak, streak); } else { streak = 1; }
      }
      maxStreak = Math.max(maxStreak, currentStreak);
    }

    // Basics
    const avgIntensity = n > 0 ? (cries.reduce((s, c) => s + c.intensity, 0) / n).toFixed(1) : '—';
    const withPhoto = cries.filter(c => c.photoUri).length;

    // Country counts
    const countryMap: Record<string, number> = {};
    for (const c of cries) {
      if (c.country) countryMap[c.country] = (countryMap[c.country] ?? 0) + 1;
    }
    const countryList = Object.entries(countryMap)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));
    const countryCount = countryList.length;

    // All 12 months (bar chart)
    const monthData = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = getMonthKey(d);
      const count = cries.filter(c => getMonthKey(new Date(c.createdAt)) === key).length;
      return { label: MONTHS[d.getMonth()], value: count };
    });
    const maxMonth = Math.max(...monthData.map(d => d.value), 1);

    // Emotion counts
    const emotionCounts: Record<string, number> = {};
    for (const c of cries) emotionCounts[c.emotion] = (emotionCounts[c.emotion] ?? 0) + 1;
    const emotionList = EMOTIONS
      .filter(e => emotionCounts[e.id])
      .sort((a, b) => (emotionCounts[b.id] ?? 0) - (emotionCounts[a.id] ?? 0));
    const topEmotion = emotionList[0] ?? null;

    // Weekday (Mon-first)
    const byDay = Array(7).fill(0);
    for (const c of cries) byDay[new Date(c.createdAt).getDay()]++;
    const weekdayData = DAY_ORDER.map((jsDay, i) => ({ label: DAY_LABELS[i], value: byDay[jsDay] }));
    const maxDay = Math.max(...weekdayData.map(d => d.value), 1);

    // Hourly
    const byHour = Array(24).fill(0);
    for (const c of cries) byHour[new Date(c.createdAt).getHours()]++;
    const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: byHour[h] }));

    // Emotion trends — last 6 months, top 2 per month
    const sixAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const recentCries = cries.filter(c => new Date(c.createdAt) >= sixAgo);
    const trendMap: Record<string, Record<string, number>> = {};
    for (const c of recentCries) {
      const ym = getMonthKey(new Date(c.createdAt));
      if (!trendMap[ym]) trendMap[ym] = {};
      trendMap[ym][c.emotion] = (trendMap[ym][c.emotion] ?? 0) + 1;
    }
    const trendMonths = Object.keys(trendMap).sort();
    const trendData = trendMonths.map(ym => ({
      ym,
      top: Object.entries(trendMap[ym])
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([id, count]) => ({ emotion: emotionById(id), count })),
    }));

    return {
      thisWeek, thisMonth, thisYear, currentStreak, maxStreak,
      avgIntensity, withPhoto, countryList, countryCount,
      monthData, maxMonth, emotionCounts, emotionList, topEmotion,
      weekdayData, maxDay, hourBuckets, trendData,
    };
  }, [cries, n]);

  const {
    thisWeek, thisMonth, thisYear, currentStreak, maxStreak,
    avgIntensity, withPhoto, countryList, countryCount,
    monthData, maxMonth, emotionCounts, emotionList, topEmotion,
    weekdayData, maxDay, hourBuckets, trendData,
  } = stats;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <ActivityIndicator size="large" color={accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={s.empty}>
          <Text style={{ fontSize: 52 }}>📊</Text>
          <Text style={s.emptyTitle}>Statistics</Text>
          <Text style={s.emptyMsg}>
            Create an account to track your cry history, streaks, and emotions over time.
          </Text>
          <TouchableOpacity
            style={[s.emptyBtn, { backgroundColor: accent }]}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.85}
          >
            <Text style={s.emptyBtnTxt}>Create account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (n === 0) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={s.empty}>
          <Text style={{ fontSize: 48, opacity: 0.25 }}>📊</Text>
          <Text style={s.emptyTxt}>No cries logged yet</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Row 1: This week / month / year ── */}
        <View style={s.cardRow}>
          <StatCard value={thisWeek}  label="This week" />
          <StatCard value={thisMonth} label="This month" />
          <StatCard value={thisYear}  label="This year" />
        </View>

        {/* ── Row 2: Total / streak / best streak ── */}
        <View style={s.cardRow}>
          <StatCard value={n}             label="Total cries" />
          <StatCard value={currentStreak} label="Streak" />
          <StatCard value={maxStreak}     label="Best streak" />
        </View>

        {/* ── Row 3: Avg intensity / countries / with photo ── */}
        <View style={[s.cardRow, { marginBottom: 0 }]}>
          <StatCard value={avgIntensity} label="Avg intensity" />
          <StatCard value={countryCount} label="Countries" />
          <StatCard value={withPhoto}    label="With photo" />
        </View>

        {/* ── CRIES PER MONTH (free) ── */}
        <View style={s.section}>
          <SectionHeader title="CRIES PER MONTH" />
          <View style={{ gap: 0 }}>
            {monthData.map((d, i) => (
              <HBar key={i} label={d.label} value={d.value} max={maxMonth} labelWidth={28} />
            ))}
          </View>
        </View>

        {/* ── #1 EMOTION (free) ── */}
        {topEmotion && (
          <View style={s.section}>
            <SectionHeader title="#1 EMOTION" />
            <View style={[s.emotionTop, { backgroundColor: topEmotion.color + '18', borderColor: topEmotion.color + '44' }]}>
              <Text style={{ fontSize: 36 }}>{topEmotion.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.emotionTopName, { color: topEmotion.color }]}>{topEmotion.label}</Text>
                <Text style={s.emotionTopCount}>{emotionCounts[topEmotion.id]} {emotionCounts[topEmotion.id] === 1 ? 'cry' : 'cries'}</Text>
              </View>
              <Text style={[s.emotionTopPct, { color: topEmotion.color }]}>
                {Math.round((emotionCounts[topEmotion.id] / n) * 100)}%
              </Text>
            </View>
          </View>
        )}

        {/* ══════ PREMIUM SECTIONS ══════ */}

        {/* ── EMOTION BREAKDOWN 💎 ── */}
        <PremiumSection isPremium={isPremium} title="EMOTION BREAKDOWN" onLockPress={goPaywall}>
          <View style={{ gap: 0 }}>
            {emotionList.map(e => (
              <HBar
                key={e.id}
                label={`${e.emoji} ${e.label}`}
                value={emotionCounts[e.id] ?? 0}
                max={n}
                color={e.color}
                labelWidth={100}
              />
            ))}
          </View>
        </PremiumSection>

        {/* ── DAY OF WEEK 💎 ── */}
        <PremiumSection isPremium={isPremium} title="DAY OF WEEK" onLockPress={goPaywall}>
          <View style={{ gap: 0 }}>
            {weekdayData.map((d, i) => (
              <HBar key={i} label={d.label} value={d.value} max={maxDay} labelWidth={32} />
            ))}
          </View>
        </PremiumSection>

        {/* ── COUNTRIES 💎 ── */}
        <PremiumSection isPremium={isPremium} title="COUNTRIES" onLockPress={goPaywall}>
          {countryList.length === 0 ? (
            <Text style={s.emptyInner}>No country data yet</Text>
          ) : (
            <View style={{ gap: 0 }}>
              {countryList.map(({ name, count }) => (
                <HBar key={name} label={`🌍 ${name}`} value={count} max={n} labelWidth={160} />
              ))}
            </View>
          )}
        </PremiumSection>

        {/* ── WHO LIKED YOUR CRIES THE MOST 💎 ── */}
        <PremiumSection isPremium={isPremium} title="WHO LIKED YOUR CRIES THE MOST" onLockPress={goPaywall}>
          {topLikers.length === 0 ? (
            <Text style={s.emptyInner}>No likes yet 💧</Text>
          ) : (
            topLikers.map((liker, i) => (
              <View key={liker.actor_id} style={[s.likerRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#1a2233' }]}>
                <Text style={s.likerRank}>#{i + 1}</Text>
                <LikerAvatar uri={liker.avatar_uri} />
                <View style={{ flex: 1 }}>
                  <Text style={s.likerName}>{liker.display_name || liker.username}</Text>
                  <Text style={s.likerHandle}>@{liker.username}</Text>
                </View>
                <Text style={[s.likerCount, { color: accent }]}>{liker.count} 💧</Text>
              </View>
            ))
          )}
        </PremiumSection>

        {/* ── YOUR MOST ACTIVE CRYING HOUR 💎 ── */}
        <PremiumSection isPremium={isPremium} title="YOUR MOST ACTIVE CRYING HOUR" onLockPress={goPaywall}>
          <HourChart buckets={hourBuckets} />
        </PremiumSection>

        {/* ── EMOTION TRENDS (LAST 6 MONTHS) 💎 ── */}
        <PremiumSection isPremium={isPremium} title="EMOTION TRENDS (LAST 6 MONTHS)" onLockPress={goPaywall}>
          {trendData.length === 0 ? (
            <Text style={s.emptyInner}>Not enough data yet</Text>
          ) : (
            trendData.map(({ ym, top }) => (
              <View key={ym} style={s.trendRow}>
                <Text style={s.trendMonth}>{shortMonthLabel(ym)}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {top.map(({ emotion: e, count }) => e ? (
                    <View key={e.id} style={[s.emotionChip, { backgroundColor: e.color + '22' }]}>
                      <Text style={{ fontSize: 14 }}>{e.emoji}</Text>
                      <Text style={[s.emotionChipLabel, { color: e.color }]}>{e.label}</Text>
                      <Text style={s.emotionChipCount}>{count}</Text>
                    </View>
                  ) : null)}
                </View>
              </View>
            ))
          )}
        </PremiumSection>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Small sub-components used only in this file ──────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  const { theme: { accent } } = useTheme();
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} style={s.backBtn}>
        <Text style={[s.backTxt, { color: accent }]}>←</Text>
      </TouchableOpacity>
      <Text style={s.title}>Statistics</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

function LikerAvatar({ uri }: { uri: string | null }) {
  if (uri) return <Image source={{ uri }} style={s.likerAvatar} />;
  return (
    <View style={[s.likerAvatar, { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontSize: 16 }}>💧</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#6fe0e6', fontSize: 22 },
  title: { color: '#e2e8f0', fontSize: 18, fontWeight: '700' },

  scroll: { padding: 16, gap: 12, paddingBottom: 40 },

  // Stat cards
  cardRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#111827', borderRadius: 14,
    borderWidth: 1, borderColor: '#1f2937',
    paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 3,
  },
  statVal: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  statLbl: { color: '#4a5568', fontSize: 10, fontFamily: 'monospace', textAlign: 'center' },

  // Sections
  section: {
    backgroundColor: '#111827', borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937', padding: 16,
  },
  sectionTitle: {
    color: '#4a5568', fontSize: 10, fontFamily: 'monospace',
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  premiumBadge: { fontSize: 12 },

  // #1 Emotion
  emotionTop: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  emotionTopName: { fontSize: 17, fontWeight: '700' },
  emotionTopCount: { color: '#64748b', fontSize: 13, marginTop: 2 },
  emotionTopPct: { fontSize: 22, fontWeight: '800' },

  // Lock overlay
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 17, 23, 0.88)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  lockTitle: { color: '#6fe0e6', fontSize: 15, fontWeight: '700' },
  lockSub: { color: '#374151', fontSize: 12, fontFamily: 'monospace', marginTop: 2 },

  // Peak hour label
  peakLabel: { color: '#64748b', fontSize: 13 },

  // Top likers
  likerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  likerRank: { color: '#374151', fontSize: 13, fontFamily: 'monospace', width: 24 },
  likerAvatar: { width: 36, height: 36, borderRadius: 18 },
  likerName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  likerHandle: { color: '#4a5568', fontSize: 12 },
  likerCount: { color: '#6fe0e6', fontSize: 14, fontWeight: '700' },

  // Countries
  emptyInner: { color: '#374151', fontSize: 13, fontFamily: 'monospace' },

  // Emotion trends
  trendRow: { paddingVertical: 10, gap: 6, borderTopWidth: 1, borderTopColor: '#1a2233' },
  trendMonth: { color: '#64748b', fontSize: 11, fontFamily: 'monospace' },
  emotionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  emotionChipLabel: { fontSize: 12, fontWeight: '600' },
  emotionChipCount: { color: '#4a5568', fontSize: 11 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40 },
  emptyTxt: { color: '#4a5568', fontSize: 15 },
  emptyTitle: { color: '#e2e8f0', fontSize: 22, fontWeight: '700', marginTop: 4 },
  emptyMsg: { color: '#4a5568', fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: 4 },
  emptyBtn: {
    marginTop: 16, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  emptyBtnTxt: { color: '#0d1117', fontSize: 15, fontWeight: '700' },
});
