/**
 * Pro Analytics screen — /pro-analytics
 * Premium-only deep stats:
 *   - Who liked your cries the most
 *   - Your most active crying hour
 *   - Emotion trends over the last 6 months
 */

import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { emotionById, EMOTIONS } from '../lib/emotions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopLiker {
  actor_id: string;
  count: number;
  username: string;
  display_name: string;
  avatar_uri: string | null;
}

interface HourBucket { hour: number; count: number }
interface MonthEmotion { month: string; emotion: string; count: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ uri, size = 36 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[st.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.45 }}>💧</Text>
    </View>
  );
}

function hour12(h: number) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProAnalyticsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [topLikers, setTopLikers] = useState<TopLiker[]>([]);
  const [hourBuckets, setHourBuckets] = useState<HourBucket[]>([]);
  const [emotionTrends, setEmotionTrends] = useState<MonthEmotion[]>([]);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    load();
  }, [session]));

  async function load() {
    if (!session) return;
    setLoading(true);

    const userId = session.user.id;

    // ── 1. Top likers: join notifications → profiles ──────────────────────────
    const { data: likesData } = await supabase
      .from('notifications')
      .select('actor_id, profile:profiles!notifications_actor_id_fkey(username, display_name, avatar_uri)')
      .eq('user_id', userId)
      .eq('type', 'like');

    if (likesData) {
      const counts: Record<string, { count: number; username: string; display_name: string; avatar_uri: string | null }> = {};
      for (const row of likesData) {
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

    // ── 2. Most active hour ───────────────────────────────────────────────────
    const { data: criesData } = await supabase
      .from('cries')
      .select('created_at')
      .eq('user_id', userId);

    if (criesData) {
      const byHour: Record<number, number> = {};
      for (const c of criesData) {
        const h = new Date(c.created_at).getHours();
        byHour[h] = (byHour[h] ?? 0) + 1;
      }
      const buckets: HourBucket[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: byHour[h] ?? 0 }));
      setHourBuckets(buckets);
    }

    // ── 3. Emotion trends: last 6 months ─────────────────────────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: emotionData } = await supabase
      .from('cries')
      .select('created_at, emotion')
      .eq('user_id', userId)
      .gte('created_at', sixMonthsAgo.toISOString());

    if (emotionData) {
      const counts: Record<string, Record<string, number>> = {};
      for (const c of emotionData) {
        const ym = c.created_at.slice(0, 7); // YYYY-MM
        if (!counts[ym]) counts[ym] = {};
        counts[ym][c.emotion] = (counts[ym][c.emotion] ?? 0) + 1;
      }
      const trends: MonthEmotion[] = [];
      for (const [month, emotionMap] of Object.entries(counts)) {
        // Pick top 2 emotions per month
        const sorted = Object.entries(emotionMap).sort(([, a], [, b]) => b - a).slice(0, 2);
        for (const [emotion, count] of sorted) {
          trends.push({ month, emotion, count });
        }
      }
      trends.sort((a, b) => a.month.localeCompare(b.month));
      setEmotionTrends(trends);
    }

    setLoading(false);
  }

  // Peak hour
  const peakBucket = hourBuckets.reduce((best, b) => b.count > best.count ? b : best, { hour: 0, count: 0 });
  const maxHourCount = Math.max(...hourBuckets.map(b => b.count), 1);

  // Months for trend chart
  const months = [...new Set(emotionTrends.map(t => t.month))].sort();

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Text style={st.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={st.title}>Pro Analytics</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6fe0e6" /></View>
      ) : (
        <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

          {/* ── Top Likers ── */}
          <Text style={st.sectionLabel}>WHO LIKED YOUR CRIES THE MOST</Text>
          <View style={st.card}>
            {topLikers.length === 0 ? (
              <Text style={st.empty}>No likes yet 💧</Text>
            ) : (
              topLikers.map((liker, i) => (
                <View key={liker.actor_id} style={[st.likerRow, i > 0 && st.rowBorder]}>
                  <Text style={st.rank}>#{i + 1}</Text>
                  <Avatar uri={liker.avatar_uri} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.likerName}>{liker.display_name}</Text>
                    <Text style={st.likerHandle}>@{liker.username}</Text>
                  </View>
                  <Text style={st.likerCount}>{liker.count} 💧</Text>
                </View>
              ))
            )}
          </View>

          {/* ── Most Active Hour ── */}
          <Text style={st.sectionLabel}>YOUR MOST ACTIVE CRYING HOUR</Text>
          <View style={st.card}>
            {peakBucket.count > 0 && (
              <Text style={st.peakLabel}>
                Peak: <Text style={st.peakHour}>{hour12(peakBucket.hour)}</Text>
                {'  '}({peakBucket.count} {peakBucket.count === 1 ? 'cry' : 'cries'})
              </Text>
            )}
            <View style={st.barChart}>
              {hourBuckets.filter((_, i) => i % 3 === 0 || hourBuckets[i].count > 0).map(b => (
                <View key={b.hour} style={st.barCol}>
                  <View style={[
                    st.bar,
                    {
                      height: Math.max(4, (b.count / maxHourCount) * 80),
                      backgroundColor: b.hour === peakBucket.hour ? '#6fe0e6' : '#1f2937',
                    },
                  ]} />
                  {b.count > 0 && <Text style={st.barLabel}>{hour12(b.hour)}</Text>}
                </View>
              ))}
            </View>
          </View>

          {/* ── Emotion Trends ── */}
          <Text style={st.sectionLabel}>EMOTION TRENDS (LAST 6 MONTHS)</Text>
          <View style={st.card}>
            {emotionTrends.length === 0 ? (
              <Text style={st.empty}>Not enough data yet. Log more cries!</Text>
            ) : (
              months.map(month => {
                const monthEntries = emotionTrends.filter(t => t.month === month);
                return (
                  <View key={month} style={[st.trendRow, months[0] !== month && st.rowBorder]}>
                    <Text style={st.trendMonth}>{monthLabel(month)}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {monthEntries.map(t => {
                        const e = emotionById(t.emotion);
                        return (
                          <View key={t.emotion} style={[st.emotionChip, { backgroundColor: (e?.color ?? '#6fe0e6') + '22' }]}>
                            <Text style={{ fontSize: 14 }}>{e?.emoji ?? '💧'}</Text>
                            <Text style={[st.emotionLabel, { color: e?.color ?? '#6fe0e6' }]}>
                              {e?.label ?? t.emotion}
                            </Text>
                            <Text style={st.emotionCount}>{t.count}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#6fe0e6', fontSize: 22 },
  title: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },

  content: { padding: 16, gap: 8, paddingBottom: 40 },

  sectionLabel: {
    color: '#4a5568', fontSize: 10, fontFamily: 'monospace',
    letterSpacing: 1.2, marginTop: 16, marginBottom: 8,
  },
  card: {
    backgroundColor: '#111827', borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937',
    paddingHorizontal: 16, paddingVertical: 12,
    gap: 0,
  },
  empty: { color: '#374151', fontSize: 13, fontFamily: 'monospace', paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#1f2937' },

  // Top likers
  likerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rank: { color: '#374151', fontSize: 13, fontFamily: 'monospace', width: 24 },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  likerName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  likerHandle: { color: '#4a5568', fontSize: 12 },
  likerCount: { color: '#6fe0e6', fontSize: 14, fontWeight: '700' },

  // Hour chart
  peakLabel: { color: '#64748b', fontSize: 13, marginBottom: 12 },
  peakHour: { color: '#6fe0e6', fontWeight: '700' },
  barChart: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 3,
    height: 100, paddingTop: 8,
  },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  bar: { width: '80%', borderRadius: 3 },
  barLabel: { color: '#374151', fontSize: 8, fontFamily: 'monospace' },

  // Emotion trends
  trendRow: { paddingVertical: 10, gap: 6 },
  trendMonth: { color: '#64748b', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 },
  emotionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  emotionLabel: { fontSize: 12, fontWeight: '600' },
  emotionCount: { color: '#4a5568', fontSize: 11 },
});
