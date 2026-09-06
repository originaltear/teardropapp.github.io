import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator,
  Image, Alert, Platform,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioPlayer, useAudioPlayerStatus,
  useAudioRecorder, useAudioRecorderState, RecordingPresets,
  requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';
import { EMOTIONS, emotionById } from '../lib/emotions';
import { EmotionIcon, Tear } from '../components/EmotionIcon';
import { saveCry, updateCry, loadCries, getOwnCry, generateCryId, Cry } from '../lib/storage';
import { PRESET_TAGS, MAX_TAGS, MAX_TAG_LEN, normalizeTag } from '../lib/tags';
import { reverseCountry } from '../lib/geo';
import { getDefaultCryVisibility, getCloseFriends } from '../lib/social';
import { checkAndSaveAchievements } from '../lib/achievements';
import { useAchievementToast } from '../components/AchievementToastProvider';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/themes';
import { PressableScale } from '../components/PressableScale';
import { tapLight, tapMedium, selection, success, warning } from '../lib/haptics';

type Visibility = 'everyone' | 'followers' | 'close_friends' | 'only_me';

// Names for the 1–5 intensity scale so the drops carry meaning.
const INTENSITY_LABELS = ['', 'Barely', 'Mild', 'Moderate', 'Heavy', 'Overwhelming'];

/** "Today · 14:30", "Yesterday · 09:05", else "5 June 2026 · 14:30". */
function whenLabel(d: Date): string {
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  // Measured from midnight rather than in whole days, so a cry logged at
  // exactly 00:00 today still reads as today.
  const since = midnight.getTime() - d.getTime();
  if (since <= 0) return `Today · ${time}`;
  if (since <= 86_400_000) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ${time}`;
}

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
  // Intensity is tinted by whatever feeling is picked, so choosing one
  // colours the whole question rather than only its own pill.

  const { queueAchievements } = useAchievementToast();
  const { lat, lng, editId } = useLocalSearchParams<{ lat: string; lng: string; editId: string }>();
  const isEdit = !!editId;
  const [emotion, setEmotion] = useState<string | null>(null);
  // Intensity is tinted by whatever feeling is picked, so choosing one
  // colours the whole question rather than only its own pill.
  const dropColor = (emotion && emotionById(emotion)?.color) || accent;
  const [intensity, setIntensity] = useState(3);
  // When the cry actually happened. Defaults to now, but people often log after
  // the fact ("I forgot to add yesterday's"), so it can be moved back.
  const [when, setWhen] = useState(() => new Date());
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('everyone');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  // The cry being edited — carries the fields that never change (id, coords,
  // country, createdAt). Null while loading and in create mode.
  const [editingCry, setEditingCry] = useState<Cry | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  // Count of the user's close friends, shown as a hint when "Close friends"
  // visibility is picked. null = still loading.
  const [closeFriendCount, setCloseFriendCount] = useState<number | null>(null);

  // Load user's default visibility from profile (create mode only — an edit
  // must keep the cry's own visibility)
  useEffect(() => {
    if (isEdit) return;
    getDefaultCryVisibility().then(setVisibility);
  }, [isEdit]);

  // Edit mode: prefill every field from the existing cry
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    getOwnCry(editId).then(found => {
      if (cancelled) return;
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
      setWhen(new Date(found.createdAt));
      setLoadingEdit(false);
    });
    return () => { cancelled = true; };
  }, [editId]);

  // Keep the close-friends count fresh — refetched on focus so it reflects any
  // edits made on the manage screen the user just returned from.
  useFocusEffect(useCallback(() => {
    if (!session) { setCloseFriendCount(0); return; }
    let cancelled = false;
    getCloseFriends()
      .then(list => { if (!cancelled) setCloseFriendCount(list.length); })
      .catch(() => { if (!cancelled) setCloseFriendCount(0); });
    return () => { cancelled = true; };
  }, [session]));

  // ── When it happened ──

  /** You can log a cry late, but never one that hasn't happened yet. */
  function capToNow(d: Date): Date {
    const now = new Date();
    return d.getTime() > now.getTime() ? now : d;
  }

  function onPickerChange(event: DateTimePickerEvent, picked?: Date) {
    // Android dismisses its own dialog; iOS keeps the spinner until we close it.
    if (Platform.OS === 'android') setPicker(null);
    if (event.type !== 'set' || !picked) return;

    // iOS shows date and time in a single spinner, so there's nothing to merge.
    if (Platform.OS !== 'android') { setWhen(capToNow(picked)); return; }

    // Android has no combined dialog: take the day, then chain into the time.
    const next = new Date(when);
    if (picker === 'date') {
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      setWhen(capToNow(next));
      setPicker('time');
    } else {
      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      setWhen(capToNow(next));
    }
  }

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
      // No forced crop — keep the photo exactly as taken (cards/detail views
      // letterbox any aspect ratio fine, and upload compression handles size)
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.8,
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
          createdAt: when.toISOString(),
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

    const place = await reverseCountry(parseFloat(lat), parseFloat(lng));

    try {
      await saveCry({
        id: generateCryId(),
        createdAt: when.toISOString(),
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        emotion,
        intensity,
        note: note.trim() || undefined,
        photoUri: photoUri ?? undefined,
        audioUri: audioUri ?? undefined,
        country: place.name,
        countryCode: place.code,
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
        behavior="padding"
        automaticOffset
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

          {/* When it happened */}
          <TouchableOpacity
            style={styles.locationRow}
            onPress={() => { tapLight(); setPicker('date'); }}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Happened ${whenLabel(when)}. Tap to change.`}
          >
            <Text style={styles.locationPin}>🕒</Text>
            <Text style={[styles.locationText, { flex: 1 }]}>{whenLabel(when)}</Text>
            <Text style={[styles.whenChange, { color: accent }]}>Change</Text>
          </TouchableOpacity>
          {!isEdit && when.toDateString() !== new Date().toDateString() && (
            <Text style={styles.whenHint}>The pin still lands where you are now.</Text>
          )}

          {picker && (Platform.OS === 'android' ? (
            <DateTimePicker
              value={when}
              mode={picker}
              is24Hour
              maximumDate={new Date()}
              onChange={onPickerChange}
            />
          ) : (
            <View style={styles.iosPicker}>
              <DateTimePicker
                value={when}
                mode="datetime"
                display="spinner"
                maximumDate={new Date()}
                textColor="#e2e8f0"
                onChange={onPickerChange}
              />
              <TouchableOpacity onPress={() => { tapLight(); setPicker(null); }} hitSlop={10}>
                <Text style={[styles.whenChange, { color: accent, textAlign: 'center' }]}>Done</Text>
              </TouchableOpacity>
            </View>
          ))}

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
                  <EmotionIcon emotion={e.id} size={38} />
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
              <TouchableOpacity
                key={n}
                onPress={() => { selection(); setIntensity(n); }}
                style={styles.dropBtn}
                accessibilityRole="button"
                accessibilityLabel={`Intensity ${n} of 5`}
              >
                {/* Tinted to whatever is picked, so choosing a feeling colours
                    the whole question rather than just its own pill. */}
                <Tear size={34} filled={n <= intensity} color={dropColor} />
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
              {/* contain, not cover: this is the last look before the photo is
                  attached, so it should show what was actually taken. The file
                  is never cropped, but a filled preview made it look as though
                  it had been. Thumbnails elsewhere stay on cover, since a grid
                  of mixed aspect ratios reads as a mess. */}
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="contain" />
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

          {/* Close-friends hint: who's actually on the list + a shortcut to
              manage it. Especially catches the "list is empty → nobody sees
              this cry" case. */}
          {visibility === 'close_friends' && (
            <TouchableOpacity
              style={styles.closeFriendsHint}
              onPress={() => router.push('/close-friends')}
              activeOpacity={0.7}
              disabled={closeFriendCount === null}
            >
              <Text style={styles.closeFriendsHintTxt}>
                {closeFriendCount === null ? (
                  'Loading your close friends…'
                ) : closeFriendCount === 0 ? (
                  <>
                    <Text style={{ color: '#eab308' }}>No close friends yet — only you will see this. </Text>
                    <Text style={[styles.closeFriendsAction, { color: accent }]}>Add some →</Text>
                  </>
                ) : (
                  <>
                    {`${closeFriendCount} close ${closeFriendCount === 1 ? 'friend' : 'friends'} can see this · `}
                    <Text style={[styles.closeFriendsAction, { color: accent }]}>Manage →</Text>
                  </>
                )}
              </Text>
            </TouchableOpacity>
          )}

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
  closeTxt: { color: '#6fe0e6', fontSize: 17 },
  title: { color: '#e2e8f0', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },

  body: { padding: 20, paddingBottom: 8 },

  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#111827', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#1f2937',
    marginBottom: 4,
  },
  locationPin: { fontSize: 17 },
  locationText: { color: '#4a5568', fontSize: 13, fontFamily: 'monospace' },

  whenChange: { fontSize: 13, fontWeight: '700' },
  whenHint: {
    color: '#4a5568', fontSize: 11, fontStyle: 'italic',
    marginTop: -2, marginBottom: 4, paddingHorizontal: 4,
  },
  iosPicker: {
    backgroundColor: '#111827', borderRadius: 10, marginTop: 4, paddingBottom: 10,
    borderWidth: 1, borderColor: '#1f2937',
  },

  sectionLabel: {
    color: '#94a3b8', fontSize: 13, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 12, marginTop: 24,
  },
  optional: { color: '#4a5568', textTransform: 'none' },

  emotionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emotionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#1f2937',
    // Content-width chips wrapped 3/3/3/1 and left "Idk" orphaned on its own
    // row. Ten emotions divide evenly into two columns instead.
    flexBasis: '48%', flexGrow: 1,
  },

  emotionLabel: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },

  intensityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dropBtn: { padding: 4 },

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
    color: '#e2e8f0', fontSize: 15,
  },
  tagAddBtn: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  tagAddTxt: { fontSize: 15, fontWeight: '600' },

  // Photo
  photoAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, padding: 16, borderStyle: 'dashed',
  },
  photoAddIcon: { fontSize: 20 },
  photoAddTxt: { color: '#4a5568', fontSize: 15 },
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
  photoRemoveTxt: { color: '#e2e8f0', fontSize: 15 },

  // Audio
  recordBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, padding: 16,
  },
  recordIcon: { fontSize: 20 },
  recordTxt: { color: '#94a3b8', fontSize: 15 },
  recordingActive: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#ef6f6f',
    borderRadius: 12, padding: 16,
  },
  recordingDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#ef6f6f',
  },
  recordingTime: { color: '#e2e8f0', fontSize: 17, fontFamily: 'monospace', flex: 1 },
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
  playIcon: { fontSize: 17, color: '#6fe0e6' },
  playTxt: { color: '#6fe0e6', fontSize: 15, fontWeight: '500' },
  deleteAudioBtn: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteAudioTxt: { fontSize: 17 },

  // Visibility
  visibilityRow: { flexDirection: 'row', gap: 8 },
  visibilityBtn: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: 10,
    backgroundColor: '#111827', borderRadius: 12,
    borderWidth: 1, borderColor: '#1f2937',
  },
  visibilityIcon: { fontSize: 20 },
  visibilityLabel: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' },
  closeFriendsHint: {
    marginTop: 10, paddingVertical: 9, paddingHorizontal: 12,
    backgroundColor: '#111827', borderRadius: 10,
    borderWidth: 1, borderColor: '#1f2937',
  },
  closeFriendsHintTxt: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },
  closeFriendsAction: { fontWeight: '600', fontSize: 13 },

  footer: { padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1f2937' },
  saveBtn: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveTxt: { color: '#0d1117', fontSize: 17, fontWeight: '700' },
});
