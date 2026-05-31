/**
 * Phase 5D — Statistics screen.
 * Route: /stats
 */
import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { loadCries, Cry } from '../lib/storage';
import { EMOTIONS, emotionById } from '../lib/emotions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Simple bar chart ─────────────────────────────────────────────────────────

function BarChart({ data, color = '#6fe0e6', labelWidth = 40 }: {
  data: { label: string; value: number }[];
  color?: string;
  labelWidth?: number;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={bc.wrap}>
      {data.map((d, i) => (
        <View key={i} style={bc.row}>
          <Text style={[bc.label, { width: labelWidth }]} numberOfLines={1}>{d.label}</Text>
          <View style={bc.barBg}>
            <View style={[bc.bar, { width: `${(d.value / max) * 100}%`, backgroundColor: color }]} />
          </View>
          <Text style={bc.val}>{d.value}</Text>
        </View>
      ))}
    </View>
  );
}
const bc = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { color: '#64748b', fontSize: 12, fontFamily: 'monospace', textAlign: 'right' },
  barBg: { flex: 1, height: 22, backgroundColor: '#1f2937', borderRadius: 6, overflow: 'hidden' },
  bar: { height: 22, borderRadius: 6, minWidth: 4 },
  val: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace', width: 28, textAlign: 'right' },
});

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ emoji, value, label }: { emoji: string; value: string | number; label: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statCardEmoji}>{emoji}</Text>
      <Text style={s.statCardValue}>{value}</Text>
      <Text style={s.statCardLabel}>{label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const router = useRouter();
  const [cries, setCries] = useState<Cry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    loadCries().then(c => { setCries(c); setLoading(false); });
  }, []));

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
          <Text style={s.title}>Statistics</Text>
          <View style={{ width: 36 }} />
        </View>
        <ActivityIndicator size="large" color="#6fe0e6" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const n = cries.length;
  if (n === 0) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
          <Text style={s.title}>Statistics</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.empty}>
          <Text style={{ fontSize: 40, opacity: 0.3 }}>📊</Text>
          <Text style={s.emptyTxt}>No cries yet</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Compute stats ──

  // Weekday distribution
  const byWeekday = Array(7).fill(0);
  for (const c of cries) byWeekday[new Date(c.createdAt).getDay()]++;
  const weekdayData = WEEKDAYS.map((label, i) => ({ label, value: byWeekday[i] }));
  const busiestDay = WEEKDAYS[byWeekday.indexOf(Math.max(...byWeekday))];

  // Emotion distribution
  const emotionCounts: Record<string, number> = {};
  for (const c of cries) emotionCounts[c.emotion] = (emotionCounts[c.emotion] ?? 0) + 1;
  const emotionData = EMOTIONS
    .filter(e => emotionCounts[e.id])
    .sort((a, b) => (emotionCounts[b.id] ?? 0) - (emotionCounts[a.id] ?? 0))
    .map(e => ({ label: `${e.emoji} ${e.label}`, value: emotionCounts[e.id] ?? 0, color: e.color }));

  // Monthly cries (last 6 months)
  const now = new Date();
  const monthData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = getMonthKey(d);
    const count = cries.filter(c => getMonthKey(new Date(c.createdAt)) === key).length;
    return { label: MONTHS[d.getMonth()], value: count };
  });

  // Countries
  const countries = [...new Set(cries.filter(c => c.country).map(c => c.country!))].sort();

  // Streaks
  const days = [...new Set(cries.map(c => c.createdAt.slice(0, 10)))].sort().reverse();
  let currentStreak = 0, maxStreak = 0, streak = 1;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (days[0] === today || days[0] === yesterday) {
    currentStreak = 1;
    for (let i = 0; i < days.length - 1; i++) {
      const diff = Math.round((new Date(days[i]).getTime() - new Date(days[i+1]).getTime()) / 86400000);
      if (diff === 1) { currentStreak++; } else break;
    }
  }
  for (let i = 0; i < days.length - 1; i++) {
    const diff = Math.round((new Date(days[i]).getTime() - new Date(days[i+1]).getTime()) / 86400000);
    if (diff === 1) { streak++; maxStreak = Math.max(maxStreak, streak); } else { streak = 1; }
  }
  maxStreak = Math.max(maxStreak, currentStreak);

  // Averages
  const avgIntensity = (cries.reduce((s, c) => s + c.intensity, 0) / n).toFixed(1);

  // This week / month / year
  const wkStart = getWeekStart(now);
  const moKey = getMonthKey(now);
  const yr = now.getFullYear();
  const thisWeek = cries.filter(c => c.createdAt.slice(0, 10) >= wkStart).length;
  const thisMonth = cries.filter(c => getMonthKey(new Date(c.createdAt)) === moKey).length;
  const thisYear = cries.filter(c => new Date(c.createdAt).getFullYear() === yr).length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>Statistics</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Summary cards */}
        <View style={s.cardRow}>
          <StatCard emoji="📅" value={thisWeek} label="This week" />
          <StatCard emoji="🗓️" value={thisMonth} label="This month" />
          <StatCard emoji="🎊" value={thisYear} label="This year" />
        </View>
        <View style={s.cardRow}>
          <StatCard emoji="💧" value={n} label="Total cries" />
          <StatCard emoji="🔥" value={currentStreak} label="Streak" />
          <StatCard emoji="🏆" value={maxStreak} label="Best streak" />
        </View>
        <View style={[s.cardRow, { marginBottom: 0 }]}>
          <StatCard emoji="💪" value={avgIntensity} label="Avg intensity" />
          <StatCard emoji="🌍" value={countries.length} label="Countries" />
          <StatCard emoji="📷" value={cries.filter(c=>c.photoUri).length} label="With photo" />
        </View>

        {/* Cries per month */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Cries per month</Text>
          <BarChart data={monthData} />
        </View>

        {/* Emotion distribution */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Emotions</Text>
          {emotionData.map(e => (
            <View key={e.label} style={bc.row}>
              <Text style={[bc.label, { width: 90 }]} numberOfLines={1}>{e.label}</Text>
              <View style={bc.barBg}>
                <View style={[bc.bar, { width: `${(e.value / n) * 100}%`, backgroundColor: e.color }]} />
              </View>
              <Text style={bc.val}>{e.value}</Text>
            </View>
          ))}
        </View>

        {/* Most active weekday */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Day of the week</Text>
          <Text style={s.highlight}>Most active: {busiestDay}</Text>
          <BarChart data={weekdayData} labelWidth={30} />
        </View>

        {/* Countries */}
        {countries.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Countries 🌍</Text>
            <View style={s.countriesList}>
              {countries.map(c => (
                <View key={c} style={s.countryChip}>
                  <Text style={s.countryTxt}>{c}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
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
  content: { padding: 20, gap: 24 },

  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1, backgroundColor: '#111827', borderRadius: 14,
    borderWidth: 1, borderColor: '#1f2937',
    padding: 14, alignItems: 'center', gap: 4,
  },
  statCardEmoji: { fontSize: 20 },
  statCardValue: { color: '#e2e8f0', fontSize: 22, fontWeight: '700' },
  statCardLabel: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' },

  section: {
    backgroundColor: '#111827', borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937', padding: 16, gap: 12,
  },
  sectionTitle: {
    color: '#94a3b8', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4,
  },
  highlight: { color: '#6fe0e6', fontSize: 13, fontWeight: '600', marginBottom: 4 },

  countriesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  countryChip: {
    backgroundColor: '#1f2937', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  countryTxt: { color: '#94a3b8', fontSize: 13 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTxt: { color: '#4a5568', fontSize: 16 },
});
