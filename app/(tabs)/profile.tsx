import { useCallback, useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { loadCries, Cry } from '../../lib/storage';
import { loadProfile, saveProfile, uploadAvatar, Profile, DEFAULT_PROFILE } from '../../lib/profile';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { getProfileStats } from '../../lib/social';
import {
  checkAndSaveAchievements, getUnlockedAchievements,
  getEarnedTears, setSelectedTears, ACHIEVEMENTS, Achievement,
} from '../../lib/achievements';
import { TearsBadge } from '../../components/TearsBadge';
import { AchievementToast } from '../../components/AchievementToast';
import { supabase } from '../../lib/supabase';

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ uri, size = 88 }: { uri?: string; size?: number }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1f2937' }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#6fe0e6', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.48 }}>💧</Text>
    </View>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({ profile, earnedTears, selectedTears: initTears, onSave, onClose }: {
  profile: Profile;
  earnedTears: string[];
  selectedTears: string[];
  onSave: (p: Profile, tears: string[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUri, setAvatarUri] = useState(profile.avatarUri);
  const [chosenTears, setChosenTears] = useState<string[]>(initTears);
  const [saving, setSaving] = useState(false);

  async function pickFromSource(source: 'camera' | 'library') {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (!res.canceled) setAvatarUri(res.assets[0].uri);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (!res.canceled) setAvatarUri(res.assets[0].uri);
    }
  }

  function handleChangePhoto() {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: '📷  Take Photo', onPress: () => pickFromSource('camera') },
      { text: '🖼  Choose from Library', onPress: () => pickFromSource('library') },
    ];
    if (avatarUri) options.push({ text: 'Use Default (Teardrop)', onPress: () => setAvatarUri(undefined), style: 'destructive' });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Change Profile Photo', undefined, options);
  }

  return (
    // No Modal wrapper — rendered inline with parent SafeAreaView
    <View style={StyleSheet.absoluteFillObject}>
      <TouchableOpacity style={ls.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={ls.sheet}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={ls.handle} />
          <View style={ls.sheetHeader}>
            <TouchableOpacity onPress={onClose}><Text style={ls.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={ls.sheetTitle}>Edit Profile</Text>
            <TouchableOpacity
              disabled={saving}
              onPress={async () => {
                setSaving(true);
                const finalUri = avatarUri ? await uploadAvatar(avatarUri) : undefined;
                await onSave(
                  { ...profile, displayName: name.trim() || 'You', bio: bio.trim(), avatarUri: finalUri },
                  chosenTears
                );
                setSaving(false);
              }}
            >
              <Text style={[ls.saveBtn, saving && { opacity: 0.5 }]}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {/* Avatar */}
            <View style={{ alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Avatar uri={avatarUri} size={88} />
              <TouchableOpacity style={ls.changePhotoBtn} onPress={handleChangePhoto} activeOpacity={0.8}>
                <Text style={ls.changePhotoTxt}>Change Photo</Text>
              </TouchableOpacity>
            </View>

            <Text style={ls.label}>Display name</Text>
            <TextInput
              style={ls.input} value={name} onChangeText={setName}
              placeholder="Your name" placeholderTextColor="#4a5568" maxLength={40}
            />
            <Text style={ls.label}>Bio <Text style={{ color: '#4a5568' }}>(optional)</Text></Text>
            <TextInput
              style={[ls.input, { height: 80 }]} value={bio} onChangeText={setBio}
              placeholder="A few words about you…" placeholderTextColor="#4a5568"
              multiline maxLength={150} textAlignVertical="top"
            />

            {/* Tears selector */}
            {earnedTears.length > 0 && (
              <>
                <Text style={ls.label}>My Tears <Text style={{ color: '#4a5568' }}>(choose up to 3 to display)</Text></Text>
                <View style={ls.tearsGrid}>
                  {earnedTears.map(tear => {
                    const chosen = chosenTears.includes(tear);
                    return (
                      <TouchableOpacity
                        key={tear}
                        style={[ls.tearChip, chosen && ls.tearChipActive]}
                        onPress={() =>
                          setChosenTears(prev =>
                            chosen ? prev.filter(t => t !== tear) : prev.length < 3 ? [...prev, tear] : prev
                          )
                        }
                      >
                        <Text style={ls.tearEmoji}>{tear}</Text>
                        {chosen && <Text style={ls.tearCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {chosenTears.length > 0 && (
                  <Text style={ls.tearsPreview}>Preview: @username {chosenTears.join(' ')}</Text>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── Profile screen ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [username, setUsername] = useState<string | null>(null);
  const [cries, setCries] = useState<Cry[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [stats, setStats] = useState({ cry_count: 0, follower_count: 0, following_count: 0 });
  const [recentAchievements, setRecentAchievements] = useState<{ id: string; unlocked_at: string }[]>([]);
  const [earnedTears, setEarnedTears] = useState<string[]>([]);
  const [selectedTears, setSelectedTearsState] = useState<string[]>([]);
  const [toastQueue, setToastQueue] = useState<Achievement[]>([]);
  const [currentToast, setCurrentToast] = useState<Achievement | null>(null);

  function showNextToast(queue: Achievement[]) {
    if (queue.length === 0) { setCurrentToast(null); return; }
    const [next, ...rest] = queue;
    setCurrentToast(next);
    setToastQueue(rest);
  }

  useFocusEffect(useCallback(() => {
    loadProfile().then(setProfile);
    const criesP = loadCries().then(c => { setCries(c); return c; });

    if (session) {
      getProfileStats(session.user.id).then(setStats);

      supabase.from('profiles').select('username, selected_tears').eq('id', session.user.id).single()
        .then(({ data }) => {
          setUsername(data?.username ?? null);
          setSelectedTearsState(data?.selected_tears ?? []);
        });

      getEarnedTears(session.user.id).then(setEarnedTears);

      getUnlockedAchievements(session.user.id).then(list => {
        setRecentAchievements(list.slice(0, 4));
      });

      criesP.then(c =>
        checkAndSaveAchievements(c, session).then(newOnes => {
          if (newOnes.length > 0) {
            setRecentAchievements(prev => [
              ...newOnes.map(a => ({ id: a.id, unlocked_at: new Date().toISOString() })),
              ...prev,
            ].slice(0, 4));
            showNextToast(newOnes);
          }
        })
      );
    }
  }, [session]));

  async function handleSave(updated: Profile, newTears: string[]) {
    await saveProfile(updated);
    setProfile(updated);
    if (session) {
      await setSelectedTears(session.user.id, newTears);
      setSelectedTearsState(newTears);
    }
    setEditOpen(false);
  }

  const countryCount = new Set(cries.filter(c => c.country).map(c => c.country!)).size;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => router.push('/stats')} style={styles.editBtn}>
            <Text style={styles.editTxt}>📊</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/calendar')} style={styles.editBtn}>
            <Text style={styles.editTxt}>📅</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditOpen(true)} style={styles.editBtn}>
            <Text style={styles.editTxt}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AchievementToast
        achievement={currentToast}
        onDismiss={() => showNextToast(toastQueue)}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={() => setEditOpen(true)}>
            <Avatar uri={profile.avatarUri} size={88} />
          </TouchableOpacity>
          <Text style={styles.displayName}>{profile.displayName}</Text>
          {username && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.usernameLabel}>@{username}</Text>
              {selectedTears.length > 0 && <TearsBadge tears={selectedTears} />}
            </View>
          )}
          {profile.bio
            ? <Text style={styles.bio}>{profile.bio}</Text>
            : <TouchableOpacity onPress={() => setEditOpen(true)}>
                <Text style={styles.bioPlaceholder}>Add a bio…</Text>
              </TouchableOpacity>
          }
        </View>

        {/* Stats row — Cries · Countries · Following · Followers */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCell} onPress={() => router.push('/my-cries')}>
            <Text style={styles.statValue}>{stats.cry_count || cries.length}</Text>
            <Text style={[styles.statLabel, styles.statTappable]}>Cries</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statCell} onPress={() => router.push('/countries')}>
            <Text style={styles.statValue}>{countryCount}</Text>
            <Text style={[styles.statLabel, styles.statTappable]}>Countries</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.statCell}
            onPress={() => session && router.push(`/follow-list?userId=${session.user.id}&type=following`)}
          >
            <Text style={styles.statValue}>{stats.following_count}</Text>
            <Text style={[styles.statLabel, session ? styles.statTappable : undefined]}>Following</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.statCell}
            onPress={() => session && router.push(`/follow-list?userId=${session.user.id}&type=followers`)}
          >
            <Text style={styles.statValue}>{stats.follower_count}</Text>
            <Text style={[styles.statLabel, session ? styles.statTappable : undefined]}>Followers</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Achievements */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Achievements</Text>
            <TouchableOpacity onPress={() => router.push('/achievements')}>
              <Text style={styles.sectionAction}>View all →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.badgeList}>
            {recentAchievements.length === 0 ? (
              <View style={styles.emptyAch}>
                <Text style={styles.emptyAchTxt}>Log your first cry to start earning achievements</Text>
              </View>
            ) : recentAchievements.map(a => {
              const def = ACHIEVEMENTS.find(x => x.id === a.id);
              if (!def) return null;
              return (
                <TouchableOpacity
                  key={a.id}
                  style={styles.badgeRow}
                  onPress={() => router.push('/achievements')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.badgeEmoji}>{def.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.badgeName}>{def.title}</Text>
                    <Text style={styles.badgeDesc} numberOfLines={1}>"{def.unlockMessage}"</Text>
                  </View>
                  {def.isTear && <Text style={{ fontSize: 14 }}>{def.tearEmoji}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {editOpen && (
        <EditModal
          profile={profile}
          earnedTears={earnedTears}
          selectedTears={selectedTears}
          onSave={handleSave}
          onClose={() => setEditOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  headerTitle: { color: '#e2e8f0', fontSize: 26, fontWeight: '700' },
  editBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#1f2937' },
  editTxt: { color: '#6fe0e6', fontSize: 14, fontWeight: '600' },
  content: { paddingBottom: 48 },
  avatarSection: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  displayName: { color: '#e2e8f0', fontSize: 22, fontWeight: '700' },
  usernameLabel: { color: '#4a5568', fontSize: 14, fontFamily: 'monospace' },
  bio: { color: '#64748b', fontSize: 14, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  bioPlaceholder: { color: '#374151', fontSize: 14, fontStyle: 'italic' },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 24,
    backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937',
    paddingVertical: 16,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  statLabel: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace' },
  statTappable: { color: '#6fe0e6' },
  statDivider: { width: 1, height: 30, backgroundColor: '#1f2937' },
  section: { marginHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#94a3b8', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' },
  sectionAction: { color: '#6fe0e6', fontSize: 12, fontWeight: '600' },
  emptyAch: { padding: 20, alignItems: 'center' },
  emptyAchTxt: { color: '#374151', fontSize: 13, textAlign: 'center' },
  badgeList: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', overflow: 'hidden' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  badgeEmoji: { fontSize: 26, width: 36, textAlign: 'center' },
  badgeName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  badgeDesc: { color: '#4a5568', fontSize: 12, marginTop: 1, fontStyle: 'italic' },
});

const ls = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#111827', maxHeight: '90%',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#1f2937',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', alignSelf: 'center', marginTop: 12 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  sheetTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },
  cancel: { color: '#4a5568', fontSize: 15 },
  saveBtn: { color: '#6fe0e6', fontSize: 15, fontWeight: '700' },
  label: { color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  input: { backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#1f2937', borderRadius: 12, padding: 12, color: '#e2e8f0', fontSize: 15, marginTop: 6 },
  changePhotoBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#6fe0e6' },
  changePhotoTxt: { color: '#6fe0e6', fontSize: 14, fontWeight: '600' },
  tearsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  tearChip: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, borderColor: '#1f2937', backgroundColor: '#0d1117', alignItems: 'center', justifyContent: 'center' },
  tearChipActive: { borderColor: '#f2cf6b', backgroundColor: '#f2cf6b15' },
  tearEmoji: { fontSize: 24 },
  tearCheck: { position: 'absolute', bottom: 2, right: 4, fontSize: 10, color: '#f2cf6b', fontWeight: '700' },
  tearsPreview: { color: '#4a5568', fontSize: 12, marginTop: 8, fontStyle: 'italic' },
});
