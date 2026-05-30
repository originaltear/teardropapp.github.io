import { useCallback, useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { loadCries, Cry } from '../../lib/storage';
import { emotionById } from '../../lib/emotions';
import { computeBadges, computeStreak, Badge } from '../../lib/badges';
import {
  loadProfile, saveProfile, Profile,
  AVATAR_COLORS, AVATAR_EMOJIS, DEFAULT_PROFILE,
} from '../../lib/profile';

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
      {cry.note
        ? <View style={ls.noteBox}><Text style={ls.noteText}>{cry.note}</Text></View>
        : <Text style={ls.noNote}>No note</Text>}
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
                  <Drops intensity={cry.intensity} />
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

// ─── Following / Followers modal (placeholder) ────────────────────────────────

function SocialModal({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ls.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={ls.sheet}>
        <View style={ls.handle} />
        <View style={ls.sheetHeader}>
          <Text style={ls.sheetTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={ls.closeBtn}>
            <Text style={ls.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={ls.empty}>
          <Text style={{ fontSize: 40, opacity: 0.3 }}>👥</Text>
          <Text style={ls.emptyTxt}>Coming in a later phase</Text>
          <Text style={ls.emptySub}>Social features unlock when accounts are added.</Text>
        </View>
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
  const [color, setColor] = useState(profile.avatarColor);
  const [emoji, setEmoji] = useState(profile.avatarEmoji);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ls.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={ls.sheet}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={ls.handle} />
          <View style={ls.sheetHeader}>
            <TouchableOpacity onPress={onClose}><Text style={ls.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={ls.sheetTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={() => onSave({ displayName: name.trim() || 'You', bio: bio.trim(), avatarColor: color, avatarEmoji: emoji })}>
              <Text style={ls.saveBtn}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            <View style={[ls.avatarPreview, { backgroundColor: color }]}>
              <Text style={{ fontSize: 36 }}>{emoji}</Text>
            </View>
            <Text style={ls.label}>Colour</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {AVATAR_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)}
                  style={[ls.swatch, { backgroundColor: c }, c === color && ls.swatchSelected]} />
              ))}
            </View>
            <Text style={ls.label}>Emoji</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {AVATAR_EMOJIS.map(e => (
                <TouchableOpacity key={e} onPress={() => setEmoji(e)}
                  style={[ls.emojiBtn, e === emoji && { backgroundColor: '#1f2937' }]}>
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={ls.label}>Display name</Text>
            <TextInput style={ls.input} value={name} onChangeText={setName}
              placeholder="Your name" placeholderTextColor="#4a5568" maxLength={40} />
            <Text style={ls.label}>Bio <Text style={{ color: '#4a5568' }}>(optional)</Text></Text>
            <TextInput style={[ls.input, { height: 80 }]} value={bio} onChangeText={setBio}
              placeholder="A few words about you…" placeholderTextColor="#4a5568"
              multiline maxLength={150} textAlignVertical="top" />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Profile screen ────────────────────────────────────────────────────────────

type ModalType = 'cries' | 'following' | 'followers' | 'edit' | null;

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [cries, setCries] = useState<Cry[]>([]);
  const [modal, setModal] = useState<ModalType>(null);

  useFocusEffect(useCallback(() => {
    loadProfile().then(setProfile);
    loadCries().then(setCries);
  }, []));

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
            <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
              <Text style={styles.avatarEmoji}>{profile.avatarEmoji}</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.displayName}>{profile.displayName}</Text>
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
            <Text style={styles.statValue}>{cries.length}</Text>
            <Text style={[styles.statLabel, styles.statTappable]}>Cries</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{streak}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statCell} onPress={() => setModal('following')}>
            <Text style={styles.statValue}>0</Text>
            <Text style={[styles.statLabel, styles.statTappable]}>Following</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statCell} onPress={() => setModal('followers')}>
            <Text style={styles.statValue}>0</Text>
            <Text style={[styles.statLabel, styles.statTappable]}>Followers</Text>
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
      {modal === 'following' && <SocialModal title="Following" onClose={() => setModal(null)} />}
      {modal === 'followers' && <SocialModal title="Followers" onClose={() => setModal(null)} />}
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
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarEmoji: { fontSize: 44 },
  displayName: { color: '#e2e8f0', fontSize: 22, fontWeight: '700' },
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
    backgroundColor: '#111827', maxHeight: '85%',
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
  avatarPreview: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  swatchSelected: { borderWidth: 3, borderColor: '#fff' },
  emojiBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#1f2937', borderRadius: 12, padding: 12, color: '#e2e8f0', fontSize: 15, marginTop: 6 },
});
