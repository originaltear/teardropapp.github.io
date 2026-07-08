/**
 * Full achievements list — all in one flat list.
 * Route: /achievements
 */
import { useCallback, useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/themes';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { ACHIEVEMENTS, getUnlockedAchievements, type Achievement } from '../lib/achievements';
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
  const [selected, setSelected] = useState<Achievement | null>(null);

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

  // Animate the progress bar filling up once the unlock data has loaded.
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: ACHIEVEMENTS.length ? unlockedCount / ACHIEVEMENTS.length : 0,
      duration: 650,
      useNativeDriver: false,
    }).start();
  }, [unlockedCount, fill]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
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

      {!loading && (
        <View style={s.progressWrap}>
          <View style={s.progressTrack}>
            <Animated.View style={[s.progressFill, {
              backgroundColor: accent,
              width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
          <Text style={[s.progressPct, { color: accent }]}>
            {Math.round((ACHIEVEMENTS.length ? unlockedCount / ACHIEVEMENTS.length : 0) * 100)}%
          </Text>
        </View>
      )}

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
              <TouchableOpacity
                style={[s.row, !unlocked && s.rowLocked]}
                onPress={() => setSelected(a)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`${a.title}. ${unlocked ? 'Unlocked' : 'Locked'}. Tap for details.`}
              >
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
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={<View style={{ height: 32 }} />}
        />
      )}

      {/* Achievement detail popup */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <TouchableOpacity style={s.popupBackdrop} activeOpacity={1} onPress={() => setSelected(null)}>
          <TouchableOpacity style={s.popup} activeOpacity={1} onPress={() => {}}>
            {selected && (() => {
              const unlocked = !!unlockedMap[selected.id];
              const showRank = (selected.id === 'founder' || selected.id === 'first_wave') && accountRank;
              return (
                <>
                  <View style={[s.popupEmojiWrap, unlocked && s.emojiWrapUnlocked]}>
                    <Text style={[s.popupEmoji, !unlocked && { opacity: 0.3 }]}>{selected.emoji}</Text>
                  </View>
                  <Text style={s.popupTitle}>{selected.title}</Text>
                  {selected.isTear && (
                    <View style={s.tearTag}>
                      <Text style={s.tearTagTxt}>{selected.tearEmoji} Tear</Text>
                    </View>
                  )}

                  <Text style={s.popupLabel}>HOW TO UNLOCK</Text>
                  <Text style={s.popupHow}>{selected.howToUnlock}</Text>

                  {unlocked ? (
                    <>
                      <Text style={[s.popupStatus, { color: accent }]}>
                        ✓ Unlocked {formatDate(unlockedMap[selected.id])}
                      </Text>
                      <Text style={s.popupMsg}>"{selected.unlockMessage}"</Text>
                    </>
                  ) : (
                    <Text style={s.popupLocked}>🔒 Not unlocked yet</Text>
                  )}

                  {showRank && (
                    <Text style={s.rankBadge}>
                      {unlocked ? `Account #${accountRank}` : `You are account #${accountRank}`}
                    </Text>
                  )}

                  <TouchableOpacity
                    style={[s.popupClose, { backgroundColor: accent }]}
                    onPress={() => setSelected(null)}
                    activeOpacity={0.85}
                  >
                    <Text style={s.popupCloseTxt}>Close</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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

  progressWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#1f2937', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressPct: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace', width: 40, textAlign: 'right' },

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

  // Detail popup
  popupBackdrop: {
    flex: 1, backgroundColor: '#000000aa',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  popup: {
    width: '100%', maxWidth: 340,
    backgroundColor: '#111827', borderRadius: 20,
    borderWidth: 1, borderColor: '#1f2937',
    alignItems: 'center', padding: 24, gap: 8,
  },
  popupEmojiWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  popupEmoji: { fontSize: 40 },
  popupTitle: { color: '#e2e8f0', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  popupLabel: {
    color: '#4a5568', fontSize: 10, fontFamily: 'monospace',
    letterSpacing: 1.5, marginTop: 12,
  },
  popupHow: { color: '#cbd5e1', fontSize: 15, lineHeight: 21, textAlign: 'center' },
  popupStatus: { fontSize: 13, fontFamily: 'monospace', fontWeight: '600', marginTop: 12 },
  popupMsg: {
    color: '#64748b', fontSize: 13, fontStyle: 'italic',
    lineHeight: 18, textAlign: 'center', marginTop: 2,
  },
  popupLocked: { color: '#4a5568', fontSize: 13, marginTop: 12 },
  popupClose: {
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 40,
    alignItems: 'center', marginTop: 20, alignSelf: 'stretch',
  },
  popupCloseTxt: { color: '#0d1117', fontSize: 15, fontWeight: '700' },
});
