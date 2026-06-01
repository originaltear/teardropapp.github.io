import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { EMOTIONS } from '../lib/emotions';
import { saveCry } from '../lib/storage';
import * as Location from 'expo-location';
import { getProfileSettings } from '../lib/social';

type Visibility = 'everyone' | 'followers' | 'close_friends' | 'only_me';

const VISIBILITY_OPTIONS: { value: Visibility; icon: string; label: string }[] = [
  { value: 'everyone',      icon: '🌍', label: 'Everyone' },
  { value: 'followers',     icon: '👥', label: 'Followers' },
  { value: 'close_friends', icon: '🔒', label: 'Close friends' },
  { value: 'only_me',       icon: '🫥', label: 'Only me' },
];

function generateId(): string {
  // RFC 4122 v4 UUID — required by Supabase uuid column type
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// (Achievement toast is now handled by AchievementToast modal component)

// ─── Log Cry screen ───────────────────────────────────────────────────────────

export default function LogCryScreen() {
  const router = useRouter();
  const { lat, lng } = useLocalSearchParams<{ lat: string; lng: string }>();
  const [emotion, setEmotion] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('everyone');

  // Load user's default visibility from profile
  useEffect(() => {
    getProfileSettings().then(s => {
      if (s?.profile_visibility) {
        // Map profile visibility → cry visibility (close_friends not available at profile level)
        const map: Record<string, Visibility> = {
          everyone: 'everyone',
          followers: 'followers',
          only_me: 'only_me',
        };
        setVisibility(map[s.profile_visibility] ?? 'everyone');
      }
    });
  }, []);

  // ── Photo state ──
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // ── Audio state ──
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      soundRef.current?.unloadAsync();
    };
  }, []);

  // ── Photo helpers ──

  async function pickFromSource(source: 'camera' | 'library') {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take a photo.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (!res.canceled) setPhotoUri(res.assets[0].uri);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Photo library access is required.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (!res.canceled) setPhotoUri(res.assets[0].uri);
    }
  }

  function handleAddPhoto() {
    Alert.alert('Add Photo', undefined, [
      { text: '📷  Take Photo', onPress: () => pickFromSource('camera') },
      { text: '🖼  Choose from Library', onPress: () => pickFromSource('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // ── Audio helpers ──

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Microphone access is required to record audio.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(rec);
      setIsRecording(true);
      setRecordSecs(0);
      timerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } catch {
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  }

  async function stopRecording() {
    if (!recording) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setAudioUri(uri ?? null);
    } catch {
      Alert.alert('Error', 'Could not stop recording.');
    }
    setRecording(null);
  }

  async function playAudio() {
    if (!audioUri) return;
    if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
      soundRef.current = sound;
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate(s => {
        if (s.isLoaded && s.didJustFinish) {
          setIsPlaying(false);
          sound.unloadAsync();
        }
      });
      await sound.playAsync();
    } catch {
      Alert.alert('Error', 'Could not play audio.');
    }
  }

  async function stopAudio() {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      setIsPlaying(false);
    }
  }

  function deleteAudio() {
    soundRef.current?.unloadAsync();
    soundRef.current = null;
    setAudioUri(null);
    setRecordSecs(0);
    setIsPlaying(false);
  }

  function fmt(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ── Save ──

  async function handleSave() {
    if (!emotion || !lat || !lng) return;
    setSaving(true);

    // Reverse geocode to get country (best-effort — don't block save on failure)
    let country: string | undefined;
    try {
      const geo = await Location.reverseGeocodeAsync({
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
      });
      country = geo[0]?.country ?? undefined;
    } catch { /* ignore geocoding failure */ }

    await saveCry({
      id: generateId(),
      createdAt: new Date().toISOString(),
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      emotion,
      intensity,
      note: note.trim() || undefined,
      photoUri: photoUri ?? undefined,
      audioUri: audioUri ?? undefined,
      country,
      visibility,
    });

    setSaving(false);

    // Navigate immediately — achievement toasts show on Profile tab (checked on focus)
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
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/')}
            style={styles.closeBtn}
          >
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Log a Cry</Text>
          <View style={{ width: 36 }} />
        </View>

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
          <Text style={styles.sectionLabel}>
            Note <Text style={styles.optional}>(optional)</Text>
          </Text>
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

          {/* ── Photo ── */}
          <Text style={styles.sectionLabel}>
            Photo <Text style={styles.optional}>(optional)</Text>
          </Text>
          {photoUri ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotoUri(null)}>
                <Text style={styles.photoRemoveTxt}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoAdd} onPress={handleAddPhoto} activeOpacity={0.75}>
              <Text style={styles.photoAddIcon}>📷</Text>
              <Text style={styles.photoAddTxt}>Add Photo</Text>
            </TouchableOpacity>
          )}

          {/* ── Voice Note ── */}
          <Text style={styles.sectionLabel}>
            Voice Note <Text style={styles.optional}>(optional)</Text>
          </Text>
          {!audioUri && !isRecording && (
            <TouchableOpacity style={styles.recordBtn} onPress={startRecording} activeOpacity={0.75}>
              <Text style={styles.recordIcon}>🎙</Text>
              <Text style={styles.recordTxt}>Record</Text>
            </TouchableOpacity>
          )}
          {isRecording && (
            <View style={styles.recordingActive}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{fmt(recordSecs)}</Text>
              <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
                <Text style={styles.stopTxt}>⏹ Stop</Text>
              </TouchableOpacity>
            </View>
          )}
          {audioUri && !isRecording && (
            <View style={styles.audioRow}>
              <TouchableOpacity
                style={styles.playBtn}
                onPress={isPlaying ? stopAudio : playAudio}
                activeOpacity={0.8}
              >
                <Text style={styles.playIcon}>{isPlaying ? '⏹' : '▶'}</Text>
                <Text style={styles.playTxt}>{isPlaying ? 'Stop' : 'Play'} · {fmt(recordSecs)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteAudioBtn} onPress={deleteAudio}>
                <Text style={styles.deleteAudioTxt}>🗑</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Visibility ── */}
          <Text style={styles.sectionLabel}>Who can see this?</Text>
          <View style={styles.visibilityRow}>
            {VISIBILITY_OPTIONS.map(opt => {
              const selected = visibility === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.visibilityBtn, selected && styles.visibilityBtnActive]}
                  onPress={() => setVisibility(opt.value)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.visibilityIcon}>{opt.icon}</Text>
                  <Text style={[styles.visibilityLabel, selected && styles.visibilityLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

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

  // Photo
  photoAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, padding: 16, borderStyle: 'dashed',
  },
  photoAddIcon: { fontSize: 22 },
  photoAddTxt: { color: '#4a5568', fontSize: 14 },
  photoContainer: { position: 'relative' },
  photoPreview: {
    width: '100%', height: 200, borderRadius: 12,
    backgroundColor: '#111827',
  },
  photoRemove: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(13,17,23,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveTxt: { color: '#e2e8f0', fontSize: 14 },

  // Audio
  recordBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, padding: 16,
  },
  recordIcon: { fontSize: 22 },
  recordTxt: { color: '#94a3b8', fontSize: 14 },
  recordingActive: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#ef6f6f',
    borderRadius: 12, padding: 16,
  },
  recordingDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#ef6f6f',
  },
  recordingTime: { color: '#e2e8f0', fontSize: 16, fontFamily: 'monospace', flex: 1 },
  stopBtn: {
    backgroundColor: '#ef6f6f22', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#ef6f6f',
  },
  stopTxt: { color: '#ef6f6f', fontSize: 13, fontWeight: '600' },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#6fe0e6',
    borderRadius: 12, padding: 14,
  },
  playIcon: { fontSize: 18, color: '#6fe0e6' },
  playTxt: { color: '#6fe0e6', fontSize: 14, fontWeight: '500' },
  deleteAudioBtn: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteAudioTxt: { fontSize: 18 },

  // Visibility
  visibilityRow: { flexDirection: 'row', gap: 8 },
  visibilityBtn: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: 10,
    backgroundColor: '#111827', borderRadius: 12,
    borderWidth: 1, borderColor: '#1f2937',
  },
  visibilityBtnActive: { borderColor: '#6fe0e6', backgroundColor: '#6fe0e610' },
  visibilityIcon: { fontSize: 20 },
  visibilityLabel: { color: '#4a5568', fontSize: 10, fontFamily: 'monospace', textAlign: 'center' },
  visibilityLabelActive: { color: '#6fe0e6' },

  footer: { padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1f2937' },
  saveBtn: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
});
