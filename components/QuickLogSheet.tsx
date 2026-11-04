/**
 * Quick log — one-tap cry logging from the map.
 * Tap an emotion → the cry is saved immediately at the current position with
 * intensity 3 and the user's default visibility. A follow-up prompt offers
 * "Add details", which opens the edit screen for note/photo/tags/intensity.
 *
 * "Just drop a tear" skips the emotion too, for when even choosing one is too
 * much in the moment. No prompt after it (that would undo the point); one
 * reminder an hour later instead, see lib/quick-log.ts.
 */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { EMOTIONS, QUICK_EMOTION } from '../lib/emotions';
import { scheduleQuickFollowup } from '../lib/quick-log';
import { saveCry, loadCries, generateCryId, Cry } from '../lib/storage';
import { getDefaultCryVisibility } from '../lib/social';
import { reverseCountry } from '../lib/geo';
import { checkAndSaveAchievements } from '../lib/achievements';
import { useAchievementToast } from './AchievementToastProvider';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/themes';
import { selection, success, warning } from '../lib/haptics';
import { EmotionIcon } from './EmotionIcon';
import { UiIcon } from './UiIcon';
import { pushMoment } from '../lib/push-ask';

export function QuickLogSheet({ visible, coords, onClose, onLogged }: {
  visible: boolean;
  coords: { latitude: number; longitude: number } | null;
  onClose: () => void;
  /** Called after a successful save so the map can refresh its pins. */
  onLogged: () => void;
}) {
  const router = useRouter();
  const { session } = useAuth();
  const { theme: { accent } } = useTheme();
  const { queueAchievements } = useAchievementToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  // Default visibility mirrors the full log screen (profile setting)
  const visibilityRef = useRef<Cry['visibility']>('followers');
  useEffect(() => {
    if (!visible) return;
    getDefaultCryVisibility().then(v => { visibilityRef.current = v; });
  }, [visible]);

  async function quickLog(emotionId: string) {
    if (!coords || savingId) return;
    selection();
    setSavingId(emotionId);

    const place = await reverseCountry(coords.latitude, coords.longitude);

    const id = generateCryId();
    try {
      await saveCry({
        id,
        createdAt: new Date().toISOString(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        emotion: emotionId,
        intensity: 3,
        country: place.name,
        countryCode: place.code,
        visibility: visibilityRef.current,
      });
    } catch (e) {
      console.warn('[quick-log] save failed:', e);
      warning();
      setSavingId(null);
      Alert.alert('Could not save', 'Something went wrong saving your cry. Please try again.');
      return;
    }

    success();

    // Achievement check in background — the toast provider lives at the app
    // root, so unlock popups appear over whatever screen the user is on.
    if (session) {
      loadCries()
        .then(cries => checkAndSaveAchievements(cries, session))
        .then(newOnes => { if (newOnes?.length) queueAchievements(newOnes); })
        .catch(() => { /* best-effort */ })
        .then(() => pushMoment('cry'));
    }

    setSavingId(null);
    onLogged();
    onClose();

    if (emotionId === QUICK_EMOTION) {
      scheduleQuickFollowup(id);
      return;
    }

    Alert.alert('Cry logged 💧', 'Want to add a note, photo or tags?', [
      { text: 'Done', style: 'cancel' },
      { text: 'Add details', onPress: () => router.push(`/log-cry?editId=${id}`) },
    ]);
  }

  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <UiIcon name="zap" size={19} color="#f2a86b" />
            <Text style={s.title}>Quick log</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <UiIcon name="x" size={18} color="#4a5568" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[s.dropBtn, { borderColor: accent }, savingId === QUICK_EMOTION && { backgroundColor: accent + '22' }]}
          onPress={() => quickLog(QUICK_EMOTION)}
          disabled={!!savingId}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityHint="Saves a tear here without choosing a feeling"
        >
          {savingId === QUICK_EMOTION
            ? <ActivityIndicator size="small" color={accent} />
            : <Text style={[s.dropBtnTxt, { color: accent }]}>Just drop a tear</Text>}
        </TouchableOpacity>
        <Text style={s.sub}>Or tap how it felt. Saved instantly, details optional</Text>

        <View style={s.grid}>
          {EMOTIONS.map(e => (
            <TouchableOpacity
              key={e.id}
              style={[s.chip, { borderColor: e.color }, savingId === e.id && { backgroundColor: e.color + '33' }]}
              onPress={() => quickLog(e.id)}
              disabled={!!savingId}
              activeOpacity={0.75}
            >
              {savingId === e.id
                ? <ActivityIndicator size="small" color={e.color} />
                : <>
                    <EmotionIcon emotion={e.id} size={32} />
                    <Text style={s.chipLabel}>{e.label}</Text>
                  </>}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={s.fullLink}
          onPress={() => {
            if (!coords) return;
            onClose();
            router.push({
              pathname: '/log-cry',
              params: { lat: String(coords.latitude), lng: String(coords.longitude) },
            });
          }}
          activeOpacity={0.7}
        >
          <Text style={[s.fullLinkTxt, { color: accent }]}>Open full log →</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingTop: 12,
    borderTopWidth: 1, borderColor: '#1f2937',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#374151', alignSelf: 'center', marginBottom: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sub: { color: '#4a5568', fontSize: 13, fontFamily: 'monospace', marginTop: 14, marginBottom: 16 },

  dropBtn: {
    marginTop: 12, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', minHeight: 46,
  },
  dropBtnTxt: { fontSize: 15, fontWeight: '700' },

  // Two fixed columns rather than chips sized to their own labels. Wrapping on
  // word length left rows ending in different places with holes on the right,
  // and twelve emotions made it worse: Cutting Onions sat alone on a row of its
  // own. Two columns is also what the full log screen does, so the two places
  // you pick a feeling now look like the same app.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  chip: {
    width: '48%',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#1f2937',
  },

  chipLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },

  fullLink: { alignItems: 'center', marginTop: 18, paddingVertical: 6 },
  fullLinkTxt: { fontSize: 15, fontWeight: '600' },
});
