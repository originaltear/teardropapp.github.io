/**
 * Phase 5E — Calendar view.
 * Route: /calendar
 */
import { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { loadCries, Cry } from '../lib/storage';
import { emotionById, EMOTIONS } from '../lib/emotions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function getDominantEmotion(dayCries: Cry[]): string | null {
  if (!dayCries.length) return null;
  const counts: Record<string, number> = {};
  for (const c of dayCries) counts[c.emotion] = (counts[c.emotion] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Day cell ─────────────────────────────────────────────────────────────────

function DayCell({
  day, dominantEmotion, cryCount, isToday, isSelected, onPress,
}: {
  day: number;
  dominantEmotion: string | null;
  cryCount: number;
  isToday: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const emotion = dominantEmotion ? emotionById(dominantEmotion) : null;
  const color = emotion?.color ?? '#6fe0e6';

  return (
    <TouchableOpacity
      style={[
        d.cell,
        isSelected && { borderColor: '#6fe0e6', borderWidth: 1 },
        isToday && d.todayCell,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[d.dayNum, isToday && d.todayNum]}>{day}</Text>
      {cryCount > 0 && (
        <View style={[d.dot, { backgroundColor: color }]}>
          <Text style={d.dotTxt}>{cryCount > 9 ? '9+' : cryCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const d = StyleSheet.create({
  cell: {
    flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: 'transparent', gap: 2,
  },
  todayCell: { backgroundColor: '#6fe0e610', borderColor: '#6fe0e640', borderWidth: 1 },
  dayNum: { color: '#94a3b8', fontSize: 13 },
  todayNum: { color: '#6fe0e6', fontWeight: '700' },
  dot: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  dotTxt: { color: '#0d1117', fontSize: 9, fontWeight: '700' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [cries, setCries] = useState<Cry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadCries().then(c => { setCries(c); setLoading(false); });
  }, []));

  // Build cry map: date → cries
  const cryMap: Record<string, Cry[]> = {};
  for (const c of cries) {
    const day = c.createdAt.slice(0, 10);
    if (!cryMap[day]) cryMap[day] = [];
    cryMap[day].push(c);
  }

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  // Monday-first: getDay() 0=Sun→6, 1=Mon→0, ...
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  const selectedCries = selectedDate ? (cryMap[selectedDate] ?? []) : [];

  // Build grid rows
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>Calendar</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6fe0e6" style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Month navigation */}
          <View style={s.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
              <Text style={s.navTxt}>‹</Text>
            </TouchableOpacity>
            <Text style={s.monthTitle}>{MONTH_NAMES[month]} {year}</Text>
            <TouchableOpacity
              onPress={nextMonth}
              style={[s.navBtn, year === now.getFullYear() && month === now.getMonth() && { opacity: 0.3 }]}
              disabled={year === now.getFullYear() && month === now.getMonth()}
            >
              <Text style={s.navTxt}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Weekday labels */}
          <View style={s.weekdayRow}>
            {WEEKDAY_LABELS.map(label => (
              <Text key={label} style={s.weekdayLabel}>{label}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={s.grid}>
            {rows.map((row, ri) => (
              <View key={ri} style={s.row}>
                {row.map((day, ci) => {
                  if (!day) return <View key={ci} style={[d.cell, { opacity: 0 }]} />;
                  const dateStr = isoDate(year, month, day);
                  const dayCries = cryMap[dateStr] ?? [];
                  const dominant = getDominantEmotion(dayCries);
                  return (
                    <DayCell
                      key={ci}
                      day={day}
                      dominantEmotion={dominant}
                      cryCount={dayCries.length}
                      isToday={dateStr === todayStr}
                      isSelected={selectedDate === dateStr}
                      onPress={() => setSelectedDate(prev => prev === dateStr ? null : dateStr)}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          {/* Month summary */}
          <View style={s.summaryRow}>
            <Text style={s.summaryStat}>
              {Object.entries(cryMap).filter(([k]) => k.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)).reduce((s, [,v]) => s + v.length, 0)} cries this month
            </Text>
          </View>

          {/* Selected day cries */}
          {selectedDate && (
            <View style={s.dayDetail}>
              <Text style={s.dayDetailTitle}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              {selectedCries.length === 0 ? (
                <Text style={s.noData}>No cries this day</Text>
              ) : selectedCries.map(cry => {
                const emotion = emotionById(cry.emotion);
                const color = emotion?.color ?? '#6fe0e6';
                return (
                  <View key={cry.id} style={s.cryItem}>
                    <View style={[s.cryDot, { backgroundColor: color + '33' }]}>
                      <Text style={{ fontSize: 18 }}>{emotion?.emoji ?? '💧'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cryEmotion, { color }]}>{emotion?.label ?? cry.emotion}</Text>
                      <Text style={s.cryTime}>
                        {new Date(cry.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{'💧'.repeat(cry.intensity)}
                      </Text>
                      {cry.note ? <Text style={s.cryNote} numberOfLines={2}>{cry.note}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
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
  content: { padding: 16, gap: 16 },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTxt: { color: '#6fe0e6', fontSize: 26 },
  monthTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },

  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, color: '#374151', fontSize: 11, textAlign: 'center', fontFamily: 'monospace' },

  grid: { gap: 4 },
  row: { flexDirection: 'row', gap: 4 },

  summaryRow: { alignItems: 'center' },
  summaryStat: { color: '#4a5568', fontSize: 13, fontFamily: 'monospace' },

  dayDetail: {
    backgroundColor: '#111827', borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937', padding: 16, gap: 12,
  },
  dayDetailTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '700' },
  noData: { color: '#374151', fontSize: 13, fontStyle: 'italic' },
  cryItem: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cryDot: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cryEmotion: { fontSize: 14, fontWeight: '600' },
  cryTime: { color: '#4a5568', fontSize: 12 },
  cryNote: { color: '#64748b', fontSize: 13, lineHeight: 18, marginTop: 2 },
});
