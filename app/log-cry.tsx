// Platform-specific: iOS + Android (keyboard avoidance behavior)
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioPlayer, useAudioPlayerStatus,
  useAudioRecorder, useAudioRecorderState, RecordingPresets,
  requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';
import { EMOTIONS } from '../lib/emotions';
import { saveCry, updateCry, loadCries, generateCryId, Cry } from '../lib/storage';
import { PRESET_TAGS, MAX_TAGS, MAX_TAG_LEN, normalizeTag } from '../lib/tags';
import * as Location from 'expo-location';
import { getProfileSettings } from '../lib/social';
import { checkAndSaveAchievements } from '../lib/achievements';
import { useAchievementToast } from '../components/AchievementToastProvider';
import { useAuth } from '../lib/auth';
import { showPostCryAd } from '../lib/ads';
import { useTheme } from '../lib/themes';
import { PressableScale } from '../components/PressableScale';
import { tapLight, tapMedium, selection, success, warning } from '../lib/haptics';

type Visibility = 'everyone' | 'followers' | 'close_friends' | 'only_me';

// Names for the 1–5 intensity scale so the drops carry meaning.
const INTENSITY_LABELS = ['', 'Barely', 'Mild', 'Moderate', 'Heavy', 'Overwhelming'];

const VISIBILITY_OPTIONS: { value: Visibility; icon: string; label: string }[] = [
  { value: 'everyone',      icon: '🌍', label: 'Everyone' },
  { value: 'followers',     icon: '👥', label: 'Friends' },
  { value: 'close_friends', icon: '🔒', label: 'Close friends' },
  { value: 'only_me',       icon: '🫥', label: 'Only me' },
];

// (Achievement toast is now handled by AchievementToast modal component)

// ─── Log Cry screen ───────────────────────────────────────────────────────────

export default function LogCryScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { theme: { accent } } = useTheme();
  const { queueAchievements } = useAchievementToast();
  const { lat, lng, editId } = useLocalSearchParams<{ lat: string; lng: string; editId: string }>();
  const isEdit = !!editId;
  const [emotion, setEmotion] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('everyone');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  // The cry being edited — carries the fields that never change (id, coords,
  // country, createdAt). Null while loading and in create mode.
  const [editingCry, setEditingCry] = useState<Cry | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);

  // Load user's default visibility from profile (create mode only — an edit
  // must keep the cry's own visibility)
  useEffect(() => {
    if (isEdit) return;
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
  }, [isEdit]);

  // Edit mode: prefill every field from the existing cry
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    loadCries().then(cries => {
      if (cancelled) return;
      const found = cries.find(c => c.id === editId);
      if (!found) {
        Alert.alert('Not found', 'This cry could not be loaded.');
        router.back();
        return;
      }
      setEditingCry(found);
      setEmotion(found.emotion);
      setIntensity(found.intensity);
      setNote(found.note ?? '');
      setVisibility(found.visibility ?? 'everyone');
      setTags(found.tags ?? []);
      setPhotoUri(found.photoUri ?? null);
      setAudioUri(found.audioUri ?? null);
      setLoadingEdit(false);
    });
    return () => { cancelled = true; };
  }, [editId]);

  // ── Tag helpers ──

  function toggleTag(tag: string) {
    selection();
    setTags(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag);
      if (prev.length >= MAX_TAGS) {
        warning();
        return prev;
      }
      return [...prev, tag];
    });
  }

  function addCustomTag() {
    const tag = normalizeTag(tagInput);
    setTagInput('');
    if (!tag) return;
    toggleTag(tag);
  }

  // ── Photo state ──
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // ── Audio state ──
  // expo-audio hooks manage the native recorder/player lifecycle — both are
  // released automatically when this screen unmounts (mid-recording included).
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [recordSecs, setRecordSecs] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const isRecording = recorderState.isRecording;
  // Preview player — the source swaps whenever a note is recorded, replaced,
  // or loaded from an existing cry in edit mode.
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const isPlaying = playerStatus.playing;

  useEffect(() => {
    if (audioUri) player.replace({ uri: audioUri });
    // `player` is a stable reference across renders (managed by the hook)
  }, [audioUri]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the screen must never keep the mic session claimed
  useEffect(() => () => {
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
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
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission needed', 'Microphone access is required to record audio.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      tapMedium();
    } catch {
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  }

  async function stopRecording() {
    tapLight();
    try {
      // Capture the duration before stop resets the recorder state
      const secs = Math.round((recorderState.durationMillis ?? 0) / 1000);
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      setRecordSecs(secs);
      setAudioUri(recorder.uri ?? null);
    } catch {
      Alert.alert('Error', 'Could not stop recording.');
    }
  }

  async function playAudio() {
    if (!audioUri) return;
    try {
      // Restart from the top when the previous playback ran to the end
      if (playerStatus.didJustFinish
        || (playerStatus.duration > 0 && playerStatus.currentTime >= playerStatus.duration)) {
        await player.seekTo(0);
      }
      player.play();
    } catch {
      Alert.alert('Error', 'Could not play audio.');
    }
  }

  async function stopAudio() {
    player.pause();
    await player.seekTo(0);
  }

  function deleteAudio() {
    player.pause();
    setAudioUri(null);
    setRecordSecs(0);
  }

  function fmt(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ── Save ──

  async function handleSave() {
    if (!emotion) return;

    // ── Edit: persist changes to the existing cry ──
    if (isEdit) {
      if (!editingCry) return;
      setSaving(true);
      try {
        await updateCry({
          ...editingCry,
          emotion,
          intensity,
          note: note.trim() || undefined,
          photoUri: photoUri ?? undefined,
          audioUri: audioUri ?? undefined,
          visibility,
          tags: tags.length ? tags : undefined,
        });
      } catch {
        warning();
        setSaving(false);
        Alert.alert('Could not save', 'Something went wrong saving your changes. Please try again.');
        return;
      }
      success();
      // Achievements can change when the emotion does (e.g. Full Spectrum)
      if (session) {
        loadCries()
          .then(cries => checkAndSaveAchievements(cries, session))
          .then(newOnes => { if (newOnes?.length) queueAchievements(newOnes); })
          .catch(() => { /* best-effort */ });
      }
      setSaving(false);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/');
      return;
    }

    // ── Create ──
    if (!lat || !lng) return;
    setSaving(true);

    // Reverse geocode to get country (best-effort, bounded — a hanging
    // geocoder must never leave the Save button spinning)
    let country: string | undefined;
    try {
      const geo = await Promise.race([
        Location.reverseGeocodeAsync({
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
        }),
        new Promise<null>(res => setTimeout(() => res(null), 3000)),
      ]);
      country = geo?.[0]?.country ?? undefined;
    } catch { /* ignore geocoding failure */ }

    try {
      await saveCry({
        id: generateCryId(),
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
        tags: tags.length ? tags : undefined,
      });
    } catch (e) {
      // Without this guard a thrown save (e.g. device storage full) left the
      // button spinning forever and silently dropped the cry.
      console.warn('[log-cry] save failed:', e);
      warning();
      setSaving(false);
      Alert.alert('Could not save', 'Something went wrong saving your cry. Please try again.');
      return;
    }

    success();

    // Trigger achievement check in background. Runs after we navigate back, but
    // the toast provider lives at the app root, so the unlock popup still appears
    // over whatever screen the user lands on.
    if (session) {
      loadCries()
        .then(cries => checkAndSaveAchievements(cries, session))
        .then(newOnes => { if (newOnes?.length) queueAchievements(newOnes); })
        .catch(() => { /* best-effort */ });
    }

    // Show post-cry ad (skipped for premium users, placeholder until AppLovin is live)
    showPostCryAd().catch(() => {});

    setSaving(false);

    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/');
  }

  const latNum = editingCry?.latitude ?? parseFloat(lat ?? '0');
  const lngNum = editingCry?.longitude ?? parseFloat(lng ?? '0');
  const hasCoords = isEdit ? !!editingCry : !!(lat && lng);
  const locationStr = hasCoords
    ? `${latNum >= 0 ? latNum.toFixed(4) + '°N' : Math.abs(latNum).toFixed(4) + '°S'}  ${lngNum >= 0 ? lngNum.toFixed(4) + '°E' : Math.abs(lngNum).toFixed(4) + '°W'}`
    : '—';

  if (loadingEdit) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/')}
            style={styles.closeBtn}
          >
            <Text style={[styles.closeTxt, { color: accent }]}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Cry</Text>
          <View style={{ width: 36 }} />
        </View>
        <ActivityIndicator size="large" color={accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/')}
            style={styles.closeBtn}
          >
            <Text style={[styles.closeTxt, { color: accent }]}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{isEdit ? 'Edit Cry' : 'Log a Cry'}</Text>
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
                  onPress={() => { selection(); setEmotion(e.id); }}
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
              <TouchableOpacity key={n} onPress={() => { selection(); setIntensity(n); }} style={styles.dropBtn}>
                <Text style={[styles.drop, { opacity: n <= intensity ? 1 : 0.25 }]}>💧</Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.intensityLabel, { color: accent }]}>{INTENSITY_LABELS[intensity]}</Text>
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

          {/* ── Tags ── */}
          <Text style={styles.sectionLabel}>
            Tags <Text style={styles.optional}>(optional · max {MAX_TAGS})</Text>
          </Text>
          <View style={styles.tagGrid}>
            {/* Custom tags first (selected, removable), then presets */}
            {tags.filter(t => !PRESET_TAGS.includes(t)).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tagChip, { borderColor: accent, backgroundColor: accent + '22' }]}
                onPress={() => toggleTag(t)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tagChipTxt, { color: accent }]}>#{t}  ✕</Text>
              </TouchableOpacity>
            ))}
            {PRESET_TAGS.map(t => {
              const selected = tags.includes(t);
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.tagChip, selected && { borderColor: accent, backgroundColor: accent + '22' }]}
                  onPress={() => toggleTag(t)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.tagChipTxt, selected && { color: accent }]}>#{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.tagInputRow}>
            <TextInput
              style={styles.tagInput}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="Add your own tag…"
              placeholderTextColor="#4a5568"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={MAX_TAG_LEN}
              onSubmitEditing={addCustomTag}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.tagAddBtn, { borderColor: accent }, !normalizeTag(tagInput) && { opacity: 0.4 }]}
              onPress={addCustomTag}
              disabled={!normalizeTag(tagInput)}
              activeOpacity={0.75}
            >
              <Text style={[styles.tagAddTxt, { color: accent }]}>+ Add</Text>
            </TouchableOpacity>
          </View>

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
              <Text style={styles.recordingTime}>
                {fmt(Math.floor((recorderState.durationMillis ?? 0) / 1000))}
              </Text>
              <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
                <Text style={styles.stopTxt}>⏹ Stop</Text>
              </TouchableOpacity>
            </View>
          )}
          {audioUri && !isRecording && (
            <View style={styles.audioRow}>
              <TouchableOpacity
                style={[styles.playBtn, { borderColor: accent }]}
                onPress={isPlaying ? stopAudio : playAudio}
                activeOpacity={0.8}
              >
                <Text style={[styles.playIcon, { color: accent }]}>{isPlaying ? '⏹' : '▶'}</Text>
                <Text style={[styles.playTxt, { color: accent }]}>
                  {isPlaying ? 'Stop' : 'Play'}{recordSecs > 0 ? ` · ${fmt(recordSecs)}` : ''}
                </Text>
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
                  style={[styles.visibilityBtn, selected && { borderColor: accent, backgroundColor: accent + '10' }]}
                  onPress={() => setVisibility(opt.value)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.visibilityIcon}>{opt.icon}</Text>
                  <Text style={[styles.visibilityLabel, selected && { color: accent }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

        </ScrollView>

        {/* Save button */}
        <View style={styles.footer}>
          <PressableScale
            style={[styles.saveBtn, { backgroundColor: accent }, (!emotion || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!emotion || saving}
          >
            {saving
              ? <ActivityIndicator color="#0d1117" />
              : <Text style={styles.saveTxt}>{isEdit ? 'Save changes' : 'Save cry'}</Text>
            }
          </PressableScale>
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

  intensityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dropBtn: { padding: 4 },
  drop: { fontSize: 28 },
  intensityLabel: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '700' },

  noteInput: {
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, padding: 14, color: '#e2e8f0', fontSize: 15,
    minHeight: 100, fontFamily: 'monospace',
  },

  // Tags
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 16, borderWidth: 1, borderColor: '#1f2937',
    backgroundColor: '#111827',
  },
  tagChipTxt: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  tagInputRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tagInput: {
    flex: 1, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: '#e2e8f0', fontSize: 14,
  },
  tagAddBtn: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  tagAddTxt: { fontSize: 14, fontWeight: '600' },

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
  visibilityIcon: { fontSize: 20 },
  visibilityLabel: { color: '#4a5568', fontSize: 10, fontFamily: 'monospace', textAlign: 'center' },

  footer: { padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1f2937' },
  saveBtn: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
});
