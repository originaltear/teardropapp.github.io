/**
 * Quick log — one-tap cry logging from the map.
 * Tap an emotion → the cry is saved immediately at the current position with
 * intensity 3 and the user's default visibility. A follow-up prompt offers
 * "Add details", which opens the edit screen for note/photo/tags/intensity.
 */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { EMOTIONS } from '../lib/emotions';
import { saveCry, loadCries, generateCryId, Cry } from '../lib/storage';
import { getDefaultCryVisibility } from '../lib/social';
import { reverseCountry } from '../lib/geo';
import { checkAndSaveAchievements } from '../lib/achievements';
import { useAchievementToast } from './AchievementToastProvider';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/themes';
import { showPostCryAd } from '../lib/ads';
import { selection, success, warning } from '../lib/haptics';

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
  const visibilityRef = useRef<Cry['visibility']>('everyone');
  useEffect(() => {
    if (!visible) return;
    getDefaultCryVisibility().then(v => { visibilityRef.current = v; });
  }, [visible]);

  async function quickLog(emotionId: string) {
    if (!coords || savingId) return;
    selection();
    setSavingId(emotionId);

    const country = await reverseCountry(coords.latitude, coords.longitude);

    const id = generateCryId();
    try {
      await saveCry({
        id,
        createdAt: new Date().toISOString(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        emotion: emotionId,
        intensity: 3,
        country,
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
        .catch(() => { /* best-effort */ });
    }

    showPostCryAd().catch(() => {});

    setSavingId(null);
    onLogged();
    onClose();

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
          <Text style={s.title}>⚡ Quick log</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.sub}>Tap how it felt — saved instantly, details optional</Text>

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
                    <Text style={s.chipEmoji}>{e.emoji}</Text>
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
  title: { color: '#e2e8f0', fontSize: 18, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#4a5568', fontSize: 18 },
  sub: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace', marginTop: 2, marginBottom: 16 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1, borderColor: '#1f2937',
    minWidth: 96, justifyContent: 'center',
  },
  chipEmoji: { fontSize: 18 },
  chipLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },

  fullLink: { alignItems: 'center', marginTop: 18, paddingVertical: 6 },
  fullLinkTxt: { fontSize: 14, fontWeight: '600' },
});
