/**
 * Full achievements list — all in one flat list.
 * Route: /achievements
 */
import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/themes';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../lib/auth';
import { ACHIEVEMENTS, getUnlockedAchievements } from '../lib/achievements';
import { supabase } from '../lib/supabase';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AchievementsScreen() {
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const { session } = useAuth();
  const [unlockedMap, setUnlockedMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [accountRank, setAccountRank] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    if (!session) { setLoading(false); return; }
    getUnlockedAchievements(session.user.id)
      .then(list => {
        const map: Record<string, string> = {};
        for (const a of list) map[a.id] = a.unlocked_at;
        setUnlockedMap(map);
      })
      .catch(e => console.warn('[achievements] load failed:', e))
      .finally(() => setLoading(false));
    // Fetch account rank for Founder/First Wave display.
    // Note: supabase.rpc() returns a PromiseLike (no .catch), so the rejection
    // handler is passed as the second arg to .then().
    supabase.rpc('get_registration_rank', { user_created_at: session.user.created_at })
      .then(
        ({ data }) => { if (typeof data === 'number') setAccountRank(data + 1); },
        () => {},
      );
  }, [session]));

  // Unlocked first (sorted newest), then locked
  const sorted = [
    ...ACHIEVEMENTS.filter(a => unlockedMap[a.id]).sort(
      (a, b) => new Date(unlockedMap[b.id]).getTime() - new Date(unlockedMap[a.id]).getTime()
    ),
    ...ACHIEVEMENTS.filter(a => !unlockedMap[a.id]),
  ];

  const unlockedCount = ACHIEVEMENTS.filter(a => unlockedMap[a.id]).length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
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

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={a => a.id}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item: a }) => {
            const unlocked = !!unlockedMap[a.id];
            return (
              <View style={[s.row, !unlocked && s.rowLocked]}>
                <View style={[s.emojiWrap, unlocked && s.emojiWrapUnlocked]}>
                  <Text style={[s.emoji, !unlocked && { opacity: 0.25 }]}>{a.emoji}</Text>
                </View>

                <View style={s.info}>
                  <View style={s.rowTop}>
                    <Text style={[s.rowTitle, !unlocked && s.rowTitleLocked]}>{a.title}</Text>
                    {a.isTear && (
                      <View style={s.tearTag}>
                        <Text style={s.tearTagTxt}>{a.tearEmoji} Tear</Text>
                      </View>
                    )}
                  </View>
                  {unlocked ? (
                    <>
                      <Text style={s.rowDate}>Unlocked {formatDate(unlockedMap[a.id])}</Text>
                      <Text style={s.rowMsg}>"{a.unlockMessage}"</Text>
                      {/* Show account number for rank-based achievements */}
                      {(a.id === 'founder' || a.id === 'first_wave') && accountRank && (
                        <Text style={s.rankBadge}>Account #{accountRank}</Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={s.rowHow}>{a.howToUnlock}</Text>
                      {(a.id === 'founder' || a.id === 'first_wave') && accountRank && (
                        <Text style={s.rankBadge}>You are account #{accountRank}</Text>
                      )}
                    </>
                  )}
                </View>

                {unlocked && <Text style={s.check}>✓</Text>}
              </View>
            );
          }}
          ListFooterComponent={<View style={{ height: 32 }} />}
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

  list: { paddingVertical: 8 },
  sep: { height: 1, backgroundColor: '#1f2937', marginLeft: 76 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowLocked: { opacity: 0.45 },

  emojiWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center',
  },
  emojiWrapUnlocked: { backgroundColor: '#6fe0e615', borderWidth: 1, borderColor: '#6fe0e630' },
  emoji: { fontSize: 26 },

  info: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  rowTitleLocked: { color: '#374151' },

  tearTag: {
    backgroundColor: '#f2cf6b22', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: '#f2cf6b44',
  },
  tearTagTxt: { color: '#f2cf6b', fontSize: 11, fontWeight: '600' },

  rowDate: { color: '#6fe0e6', fontSize: 12, fontFamily: 'monospace' },
  rowMsg: { color: '#4a5568', fontSize: 12, fontStyle: 'italic', lineHeight: 16 },
  rowHow: { color: '#64748b', fontSize: 12, lineHeight: 16 },
  rankBadge: { color: '#f2cf6b', fontSize: 11, fontWeight: '600', marginTop: 2 },
  check: { color: '#6fe0e6', fontSize: 18, fontWeight: '700' },
});
