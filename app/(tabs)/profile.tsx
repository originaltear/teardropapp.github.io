import { useCallback, useRef, useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform, FlatList,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { loadCries, Cry } from '../../lib/storage';
import { emotionById } from '../../lib/emotions';
import { computeBadges, computeStreak } from '../../lib/badges';
import { loadProfile, saveProfile, uploadAvatar, Profile, DEFAULT_PROFILE } from '../../lib/profile';
import { useAuth } from '../../lib/auth';
import { getProfileStats, getFollowList, followUser, unfollowUser, UserResult } from '../../lib/social';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Drops({ intensity }: { intensity: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: 13, opacity: n <= intensity ? 1 : 0.2 }}>💧</Text>
      ))}
    </View>
  );
}

// ─── Avatar component (shared) ────────────────────────────────────────────────

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

// ─── Audio player ─────────────────────────────────────────────────────────────

function AudioPlayer({ uri }: { uri: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  async function toggle() {
    if (playing) {
      await soundRef.current?.stopAsync();
      setPlaying(false);
      return;
    }
    try {
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate(s => {
        if (s.isLoaded && s.didJustFinish) {
          setPlaying(false);
          sound.unloadAsync();
        }
      });
      await sound.playAsync();
    } catch {
      Alert.alert('Error', 'Could not play audio.');
    }
  }

  return (
    <TouchableOpacity style={ls.audioPlayer} onPress={toggle} activeOpacity={0.8}>
      <Text style={ls.audioIcon}>{playing ? '⏹' : '▶'}</Text>
      <Text style={ls.audioLabel}>{playing ? 'Stop voice note' : 'Play voice note'}</Text>
    </TouchableOpacity>
  );
}

// ─── Cry detail card (inside modal) ──────────────────────────────────────────

function CryDetailSheet({ cry, onBack }: { cry: Cry; onBack: () => void }) {
  const emotion = emotionById(cry.emotion);
  return (
    <>
      <TouchableOpacity onPress={onBack} style={ls.backBtn}>
        <Text style={ls.backTxt}>← Back</Text>
      </TouchableOpacity>
      <View style={[ls.emotionBadge, { backgroundColor: (emotion?.color ?? '#6fe0e6') + '22' }]}>
        <Text style={{ fontSize: 20 }}>{emotion?.emoji ?? '💧'}</Text>
        <Text style={[ls.emotionLabel, { color: emotion?.color ?? '#6fe0e6' }]}>
          {emotion?.label ?? cry.emotion}
        </Text>
      </View>
      <Text style={ls.dateText}>
        {new Date(cry.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        {' · '}
        {new Date(cry.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </Text>
      <Drops intensity={cry.intensity} />
      {cry.photoUri ? (
        <Image source={{ uri: cry.photoUri }} style={ls.photo} resizeMode="cover" />
      ) : null}
      {cry.note
        ? <View style={ls.noteBox}><Text style={ls.noteText}>{cry.note}</Text></View>
        : <Text style={ls.noNote}>No note</Text>}
      {cry.audioUri ? <AudioPlayer uri={cry.audioUri} /> : null}
    </>
  );
}

// ─── Cries list modal ─────────────────────────────────────────────────────────

function CriesModal({ cries, onClose }: { cries: Cry[]; onClose: () => void }) {
  const [selected, setSelected] = useState<Cry | null>(null);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ls.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={ls.sheet}>
        <View style={ls.handle} />
        <View style={ls.sheetHeader}>
          <Text style={ls.sheetTitle}>My Cries</Text>
          <TouchableOpacity onPress={onClose} style={ls.closeBtn}>
            <Text style={ls.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        {selected ? (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
            <CryDetailSheet cry={selected} onBack={() => setSelected(null)} />
          </ScrollView>
        ) : (
          <FlatList
            data={cries}
            keyExtractor={c => c.id}
            style={{ flex: 1 }}
            contentContainerStyle={cries.length === 0 ? ls.emptyContainer : undefined}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#1f2937', marginLeft: 68 }} />}
            renderItem={({ item: cry }) => {
              const emotion = emotionById(cry.emotion);
              return (
                <TouchableOpacity style={ls.cryRow} onPress={() => setSelected(cry)} activeOpacity={0.7}>
                  <View style={[ls.dot, { backgroundColor: emotion?.color ?? '#6fe0e6' }]}>
                    <Text style={{ fontSize: 18 }}>{emotion?.emoji ?? '💧'}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[ls.emotionName, { color: emotion?.color ?? '#6fe0e6' }]}>
                      {emotion?.label ?? cry.emotion}
                    </Text>
                    <Text style={ls.cryDate}>{formatDate(cry.createdAt)}</Text>
                    {cry.note ? <Text style={ls.cryNote} numberOfLines={1}>{cry.note}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Drops intensity={cry.intensity} />
                    {(cry.photoUri || cry.audioUri) ? (
                      <View style={{ flexDirection: 'row', gap: 3 }}>
                        {cry.photoUri ? <Text style={{ fontSize: 11 }}>📷</Text> : null}
                        {cry.audioUri ? <Text style={{ fontSize: 11 }}>🎙</Text> : null}
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={ls.empty}>
                <Text style={{ fontSize: 40, opacity: 0.3 }}>💧</Text>
                <Text style={ls.emptyTxt}>No cries yet</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Follow list modal ────────────────────────────────────────────────────────

function FollowListModal({ userId, type, onClose }: {
  userId: string; type: 'followers' | 'following'; onClose: () => void;
}) {
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);

  useCallback(() => {
    getFollowList(userId, type).then(u => { setUsers(u); setLoading(false); });
  }, [])();

  async function handleToggleFollow(u: UserResult) {
    if (u.relation === 'following') {
      await unfollowUser(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, relation: 'none' } : x));
    } else if (u.relation === 'none') {
      await followUser(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, relation: 'following' } : x));
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ls.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={ls.sheet}>
        <View style={ls.handle} />
        <View style={ls.sheetHeader}>
          <Text style={ls.sheetTitle}>{type === 'followers' ? 'Followers' : 'Following'}</Text>
          <TouchableOpacity onPress={onClose} style={ls.closeBtn}><Text style={ls.closeTxt}>✕</Text></TouchableOpacity>
        </View>
        {loading
          ? <ActivityIndicator color="#6fe0e6" style={{ margin: 32 }} />
          : (
            <FlatList
              data={users}
              keyExtractor={u => u.id}
              style={{ flex: 1 }}
              contentContainerStyle={users.length === 0 ? ls.emptyContainer : undefined}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#1f2937', marginLeft: 68 }} />}
              renderItem={({ item: u }) => (
                <View style={ls.userRow}>
                  {u.avatar_uri
                    ? <Image source={{ uri: u.avatar_uri }} style={ls.userAvatar} />
                    : <View style={ls.userAvatarFallback}><Text style={{ fontSize: 18 }}>💧</Text></View>
                  }
                  <View style={{ flex: 1 }}>
                    <Text style={ls.userName}>{u.display_name}</Text>
                    <Text style={ls.userHandle}>@{u.username}</Text>
                  </View>
                  {u.relation !== 'self' && (
                    <TouchableOpacity
                      style={u.relation === 'following' ? ls.btnFollowing : ls.btnFollow}
                      onPress={() => handleToggleFollow(u)}
                    >
                      <Text style={u.relation === 'following' ? ls.btnFollowingTxt : ls.btnFollowTxt}>
                        {u.relation === 'following' ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              ListEmptyComponent={
                <View style={ls.empty}>
                  <Text style={{ fontSize: 36, opacity: 0.3 }}>👥</Text>
                  <Text style={ls.emptyTxt}>
                    {type === 'followers' ? 'No followers yet' : 'Not following anyone'}
                  </Text>
                </View>
              }
            />
          )
        }
      </SafeAreaView>
    </Modal>
  );
}

// ─── Edit profile modal ───────────────────────────────────────────────────────

function EditModal({ profile, onSave, onClose }: {
  profile: Profile; onSave: (p: Profile) => void; onClose: () => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUri, setAvatarUri] = useState(profile.avatarUri);
  const [saving, setSaving] = useState(false);

  async function pickFromSource(source: 'camera' | 'library') {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!res.canceled) setAvatarUri(res.assets[0].uri);
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
        aspect: [1, 1],
      });
      if (!res.canceled) setAvatarUri(res.assets[0].uri);
    }
  }

  function handleChangePhoto() {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: '📷  Take Photo', onPress: () => pickFromSource('camera') },
      { text: '🖼  Choose from Library', onPress: () => pickFromSource('library') },
    ];
    if (avatarUri) {
      options.push({ text: 'Use Default (Teardrop)', onPress: () => setAvatarUri(undefined), style: 'destructive' });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Change Profile Photo', undefined, options);
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
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
                // Upload avatar to Supabase Storage if it's a local URI
                const finalUri = avatarUri ? await uploadAvatar(avatarUri) : undefined;
                await onSave({ ...profile, displayName: name.trim() || 'You', bio: bio.trim(), avatarUri: finalUri });
                setSaving(false);
              }}
            >
              <Text style={[ls.saveBtn, saving && { opacity: 0.5 }]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Avatar preview + change button */}
            <View style={{ alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Avatar uri={avatarUri} size={88} />
              <TouchableOpacity style={ls.changePhotoBtn} onPress={handleChangePhoto} activeOpacity={0.8}>
                <Text style={ls.changePhotoTxt}>Change Photo</Text>
              </TouchableOpacity>
            </View>

            <Text style={ls.label}>Display name</Text>
            <TextInput
              style={ls.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#4a5568"
              maxLength={40}
            />
            <Text style={ls.label}>Bio <Text style={{ color: '#4a5568' }}>(optional)</Text></Text>
            <TextInput
              style={[ls.input, { height: 80 }]}
              value={bio}
              onChangeText={setBio}
              placeholder="A few words about you…"
              placeholderTextColor="#4a5568"
              multiline
              maxLength={150}
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Profile screen ────────────────────────────────────────────────────────────

type ModalType = 'cries' | 'following' | 'followers' | 'edit' | null;

export default function ProfileScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [username, setUsername] = useState<string | null>(null);
  const [cries, setCries] = useState<Cry[]>([]);
  const [modal, setModal] = useState<ModalType>(null);
  const [stats, setStats] = useState({ cry_count: 0, follower_count: 0, following_count: 0 });

  useFocusEffect(useCallback(() => {
    loadProfile().then(setProfile);
    loadCries().then(setCries);
    if (session) {
      getProfileStats(session.user.id).then(setStats);
      // Fetch username separately
      import('../../lib/supabase').then(({ supabase }) =>
        supabase.from('profiles').select('username').eq('id', session.user.id).single()
          .then(({ data }) => setUsername(data?.username ?? null))
      );
    }
  }, [session]));

  async function handleSave(updated: Profile) {
    await saveProfile(updated);
    setProfile(updated);
    setModal(null);
  }

  const badges = computeBadges(cries);
  const streak = computeStreak(cries);
  const earnedCount = badges.filter(b => b.earned).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => setModal('edit')} style={styles.editBtn}>
          <Text style={styles.editTxt}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={() => setModal('edit')}>
            <Avatar uri={profile.avatarUri} size={88} />
          </TouchableOpacity>
          <Text style={styles.displayName}>{profile.displayName}</Text>
          {username && <Text style={styles.usernameLabel}>@{username}</Text>}
          {profile.bio
            ? <Text style={styles.bio}>{profile.bio}</Text>
            : <TouchableOpacity onPress={() => setModal('edit')}>
                <Text style={styles.bioPlaceholder}>Add a bio…</Text>
              </TouchableOpacity>
          }
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCell} onPress={() => setModal('cries')}>
            <Text style={styles.statValue}>{stats.cry_count || cries.length}</Text>
            <Text style={[styles.statLabel, styles.statTappable]}>Cries</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{streak}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statCell} onPress={() => session && setModal('following')}>
            <Text style={styles.statValue}>{stats.following_count}</Text>
            <Text style={[styles.statLabel, session && styles.statTappable]}>Following</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statCell} onPress={() => session && setModal('followers')}>
            <Text style={styles.statValue}>{stats.follower_count}</Text>
            <Text style={[styles.statLabel, session && styles.statTappable]}>Followers</Text>
          </TouchableOpacity>
        </View>

        {/* Badges */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Badges</Text>
            <Text style={styles.sectionMeta}>{earnedCount}/{badges.length}</Text>
          </View>
          <View style={styles.badgeList}>
            {badges.map(b => (
              <View key={b.id} style={[styles.badgeRow, !b.earned && styles.badgeRowLocked]}>
                <Text style={[styles.badgeEmoji, !b.earned && { opacity: 0.3 }]}>{b.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.badgeName, !b.earned && { color: '#374151' }]}>{b.name}</Text>
                  <Text style={styles.badgeDesc}>{b.description}</Text>
                </View>
                {b.earned && <Text style={styles.badgeCheck}>✓</Text>}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {modal === 'cries' && <CriesModal cries={cries} onClose={() => setModal(null)} />}
      {modal === 'following' && session && (
        <FollowListModal userId={session.user.id} type="following" onClose={() => setModal(null)} />
      )}
      {modal === 'followers' && session && (
        <FollowListModal userId={session.user.id} type="followers" onClose={() => setModal(null)} />
      )}
      {modal === 'edit' && <EditModal profile={profile} onSave={handleSave} onClose={() => setModal(null)} />}
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
  sectionMeta: { color: '#374151', fontSize: 12, fontFamily: 'monospace' },
  badgeList: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', overflow: 'hidden' },
  badgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  badgeRowLocked: { opacity: 0.5 },
  badgeEmoji: { fontSize: 28, width: 36, textAlign: 'center' },
  badgeName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  badgeDesc: { color: '#4a5568', fontSize: 12, marginTop: 1 },
  badgeCheck: { color: '#6fe0e6', fontSize: 18, fontWeight: '700' },
});

// ─── Sheet + list styles ──────────────────────────────────────────────────────

const ls = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
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
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#4a5568', fontSize: 18 },
  cryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emotionName: { fontSize: 14, fontWeight: '600' },
  cryDate: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace' },
  cryNote: { color: '#64748b', fontSize: 12 },
  emotionBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  emotionLabel: { fontSize: 16, fontWeight: '700' },
  dateText: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace' },
  photo: { width: '100%', height: 160, borderRadius: 12, backgroundColor: '#0d1117' },
  noteBox: { backgroundColor: '#0d1117', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1f2937' },
  noteText: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  noNote: { color: '#374151', fontSize: 13, fontFamily: 'monospace' },
  backBtn: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  backTxt: { color: '#6fe0e6', fontSize: 14 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 40, paddingVertical: 48 },
  emptyTxt: { color: '#4a5568', fontSize: 17, fontWeight: '600' },
  emptySub: { color: '#374151', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  cancel: { color: '#4a5568', fontSize: 15 },
  saveBtn: { color: '#6fe0e6', fontSize: 15, fontWeight: '700' },
  label: { color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  input: { backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#1f2937', borderRadius: 12, padding: 12, color: '#e2e8f0', fontSize: 15, marginTop: 6 },
  changePhotoBtn: {
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#6fe0e6',
  },
  changePhotoTxt: { color: '#6fe0e6', fontSize: 14, fontWeight: '600' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  userName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  userHandle: { color: '#4a5568', fontSize: 12 },
  btnFollow: { backgroundColor: '#6fe0e6', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  btnFollowTxt: { color: '#0d1117', fontSize: 13, fontWeight: '700' },
  btnFollowing: { borderWidth: 1, borderColor: '#1f2937', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  btnFollowingTxt: { color: '#4a5568', fontSize: 13 },
  audioPlayer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0d1117', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#6fe0e6',
  },
  audioIcon: { fontSize: 18, color: '#6fe0e6' },
  audioLabel: { color: '#6fe0e6', fontSize: 14, fontWeight: '500' },
});
