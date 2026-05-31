/**
 * Full achievements list screen.
 * Route: /achievements
 */
import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../lib/auth';
import {
  ACHIEVEMENTS, getUnlockedAchievements, Achievement,
} from '../lib/achievements';

const CATEGORIES: { key: string; label: string; emoji: string }[] = [
  { key: 'all', label: 'All', emoji: '✦' },
  { key: 'quantity', label: 'Quantity', emoji: '📊' },
  { key: 'timing', label: 'Timing', emoji: '🕐' },
  { key: 'geography', label: 'Geography', emoji: '🌐' },
  { key: 'emotion', label: 'Emotion', emoji: '💙' },
  { key: 'streak', label: 'Streak', emoji: '🔥' },
  { key: 'media', label: 'Media', emoji: '📷' },
  { key: 'social', label: 'Social', emoji: '👥' },
  { key: 'profile', label: 'Profile', emoji: '👤' },
  { key: 'quirky', label: 'Quirky', emoji: '🎭' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AchievementsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [unlockedMap, setUnlockedMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  useFocusEffect(useCallback(() => {
    if (!session) { setLoading(false); return; }
    getUnlockedAchievements(session.user.id).then(list => {
      const map: Record<string, string> = {};
      for (const a of list) map[a.id] = a.unlocked_at;
      setUnlockedMap(map);
      setLoading(false);
    });
  }, [session]));

  const filtered = ACHIEVEMENTS.filter(
    a => activeCategory === 'all' || a.category === activeCategory
  );

  const unlockedCount = ACHIEVEMENTS.filter(a => unlockedMap[a.id]).length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Achievements</Text>
          {!loading && (
            <Text style={s.subtitle}>{unlockedCount} / {ACHIEVEMENTS.length} unlocked</Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Category filter */}
      <FlatList
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={c => c.key}
        contentContainerStyle={s.catList}
        renderItem={({ item: c }) => (
          <TouchableOpacity
            style={[s.catBtn, activeCategory === c.key && s.catBtnActive]}
            onPress={() => setActiveCategory(c.key)}
          >
            <Text style={[s.catTxt, activeCategory === c.key && s.catTxtActive]}>
              {c.emoji} {c.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#6fe0e6" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={a => a.id}
          contentContainerStyle={s.list}
          renderItem={({ item: a }) => {
            const unlocked = !!unlockedMap[a.id];
            return (
              <View style={[s.row, !unlocked && s.rowLocked]}>
                {/* Emoji */}
                <View style={[s.emojiWrap, unlocked && s.emojiWrapUnlocked]}>
                  <Text style={[s.emoji, !unlocked && { opacity: 0.25 }]}>{a.emoji}</Text>
                </View>

                {/* Text */}
                <View style={s.rowInfo}>
                  <View style={s.rowTop}>
                    <Text style={[s.rowTitle, !unlocked && s.rowTitleLocked]}>{a.title}</Text>
                    {a.isTear && <Text style={s.tearTag}>{a.tearEmoji} Tear</Text>}
                  </View>
                  {unlocked ? (
                    <Text style={s.rowDate}>Unlocked {formatDate(unlockedMap[a.id])}</Text>
                  ) : (
                    <Text style={s.rowMsg} numberOfLines={2}>"{a.unlockMessage}"</Text>
                  )}
                </View>

                {/* Check */}
                {unlocked && <Text style={s.check}>✓</Text>}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={s.sep} />}
        />
      )}
    </SafeAreaView>
  );
}

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
  subtitle: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  catList: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  catBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937',
  },
  catBtnActive: { backgroundColor: '#6fe0e6', borderColor: '#6fe0e6' },
  catTxt: { color: '#4a5568', fontSize: 12, fontWeight: '600' },
  catTxtActive: { color: '#0d1117' },

  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowLocked: { opacity: 0.55 },
  emojiWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center',
  },
  emojiWrapUnlocked: { backgroundColor: '#6fe0e615', borderWidth: 1, borderColor: '#6fe0e630' },
  emoji: { fontSize: 26 },
  rowInfo: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  rowTitleLocked: { color: '#374151' },
  tearTag: {
    backgroundColor: '#f2cf6b22', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
    color: '#f2cf6b', fontSize: 11, fontWeight: '600',
    borderWidth: 1, borderColor: '#f2cf6b44',
  },
  rowDate: { color: '#6fe0e6', fontSize: 12, fontFamily: 'monospace' },
  rowMsg: { color: '#374151', fontSize: 12, fontStyle: 'italic', lineHeight: 16 },
  check: { color: '#6fe0e6', fontSize: 18, fontWeight: '700' },
  sep: { height: 1, backgroundColor: '#1f2937', marginLeft: 76 },
});
