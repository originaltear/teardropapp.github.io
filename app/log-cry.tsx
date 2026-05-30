import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EMOTIONS } from '../lib/emotions';
import { saveCry, loadCries } from '../lib/storage';
import { computeBadges, Badge } from '../lib/badges';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Achievement banner ───────────────────────────────────────────────────────

function AchievementBanner({ badge }: { badge: Badge }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.achievement, { opacity }]}>
      <Text style={styles.achievementTag}>Achievement Unlocked!</Text>
      <Text style={styles.achievementEmoji}>{badge.emoji}</Text>
      <Text style={styles.achievementName}>{badge.name}</Text>
    </Animated.View>
  );
}

// ─── Log Cry screen ───────────────────────────────────────────────────────────

export default function LogCryScreen() {
  const router = useRouter();
  const { lat, lng } = useLocalSearchParams<{ lat: string; lng: string }>();

  const [emotion, setEmotion] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [unlockedBadge, setUnlockedBadge] = useState<Badge | null>(null);

  async function handleSave() {
    if (!emotion || !lat || !lng) return;
    setSaving(true);

    // Snapshot badges BEFORE saving to detect newly earned ones
    const criesBefore = await loadCries();
    const badgesBefore = computeBadges(criesBefore);

    await saveCry({
      id: generateId(),
      createdAt: new Date().toISOString(),
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      emotion,
      intensity,
      note: note.trim() || undefined,
    });

    // Check for newly earned badges
    const criesAfter = await loadCries();
    const badgesAfter = computeBadges(criesAfter);
    const newlyEarned = badgesAfter.find((b, i) => b.earned && !badgesBefore[i].earned);

    setSaving(false);

    if (newlyEarned) {
      setUnlockedBadge(newlyEarned);
      // Wait for banner animation before navigating back
      await new Promise(r => setTimeout(r, 2400));
    }

    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/');
  }

  const latNum = parseFloat(lat ?? '0');
  const lngNum = parseFloat(lng ?? '0');
  const locationStr = lat && lng
    ? `${latNum >= 0 ? latNum.toFixed(4) + '°N' : Math.abs(latNum).toFixed(4) + '°S'}  ${lngNum >= 0 ? lngNum.toFixed(4) + '°E' : Math.abs(lngNum).toFixed(4) + '°W'}`
    : '—';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/')} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Log a Cry</Text>
          <View style={{ width: 36 }} />
        </View>

        {unlockedBadge && <AchievementBanner badge={unlockedBadge} />}

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

          {/* Location */}
          <View style={styles.locationRow}>
            <Text style={styles.locationPin}>📍</Text>
            <Text style={styles.locationText}>{locationStr}</Text>
          </View>

          {/* Emotion picker */}
          <Text style={styles.sectionLabel}>How did it feel?</Text>
          <View style={styles.emotionGrid}>
            {EMOTIONS.map(e => {
              const selected = emotion === e.id;
              return (
                <TouchableOpacity
                  key={e.id}
                  style={[
                    styles.emotionChip,
                    { borderColor: e.color },
                    selected && { backgroundColor: e.color + '33' },
                  ]}
                  onPress={() => setEmotion(e.id)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.emotionEmoji}>{e.emoji}</Text>
                  <Text style={[styles.emotionLabel, selected && { color: e.color }]}>
                    {e.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Intensity */}
          <Text style={styles.sectionLabel}>Intensity</Text>
          <View style={styles.intensityRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => setIntensity(n)} style={styles.dropBtn}>
                <Text style={[styles.drop, { opacity: n <= intensity ? 1 : 0.25 }]}>💧</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note */}
          <Text style={styles.sectionLabel}>Note <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="What happened…"
            placeholderTextColor="#4a5568"
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
        </ScrollView>

        {/* Save button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, (!emotion || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!emotion || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#0d1117" />
              : <Text style={styles.saveTxt}>Save cry</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },

  // Achievement banner
  achievement: {
    marginHorizontal: 20,
    backgroundColor: '#111827',
    borderRadius: 16, borderWidth: 1, borderColor: '#6fe0e6',
    padding: 16, alignItems: 'center', gap: 4,
    shadowColor: '#6fe0e6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 10,
  },
  achievementTag: { color: '#6fe0e6', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' },
  achievementEmoji: { fontSize: 36 },
  achievementName: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#6fe0e6', fontSize: 18 },
  title: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },

  body: { padding: 20, paddingBottom: 8 },

  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#111827', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#1f2937',
    marginBottom: 4,
  },
  locationPin: { fontSize: 16 },
  locationText: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace' },

  sectionLabel: {
    color: '#94a3b8', fontSize: 12, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 12, marginTop: 24,
  },
  optional: { color: '#4a5568', textTransform: 'none' },

  emotionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emotionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#1f2937',
  },
  emotionEmoji: { fontSize: 16 },
  emotionLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },

  intensityRow: { flexDirection: 'row', gap: 8 },
  dropBtn: { padding: 4 },
  drop: { fontSize: 28 },

  noteInput: {
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, padding: 14, color: '#e2e8f0', fontSize: 15,
    minHeight: 100, fontFamily: 'monospace',
  },

  footer: { padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1f2937' },
  saveBtn: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
});
