import { useCallback, useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { loadCries, Cry } from '../../lib/storage';
import { computeBadges, computeStreak, Badge } from '../../lib/badges';
import {
  loadProfile, saveProfile, Profile,
  AVATAR_COLORS, AVATAR_EMOJIS, DEFAULT_PROFILE,
} from '../../lib/profile';

// ─── Edit profile modal ───────────────────────────────────────────────────────

function EditModal({
  profile,
  onSave,
  onClose,
}: {
  profile: Profile;
  onSave: (p: Profile) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [color, setColor] = useState(profile.avatarColor);
  const [emoji, setEmoji] = useState(profile.avatarEmoji);

  function handleSave() {
    onSave({ displayName: name.trim() || 'You', bio: bio.trim(), avatarColor: color, avatarEmoji: emoji });
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={es.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={es.sheet}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Handle + header */}
          <View style={es.handle} />
          <View style={es.sheetHeader}>
            <TouchableOpacity onPress={onClose}><Text style={es.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={es.sheetTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave}><Text style={es.save}>Save</Text></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={es.body} keyboardShouldPersistTaps="handled">
            {/* Avatar preview */}
            <View style={[es.avatarPreview, { backgroundColor: color }]}>
              <Text style={es.avatarPreviewEmoji}>{emoji}</Text>
            </View>

            {/* Color picker */}
            <Text style={es.label}>Colour</Text>
            <View style={es.colorRow}>
              {AVATAR_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[es.colorSwatch, { backgroundColor: c }, c === color && es.colorSelected]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>

            {/* Emoji picker */}
            <Text style={es.label}>Emoji</Text>
            <View style={es.emojiGrid}>
              {AVATAR_EMOJIS.map(e => (
                <TouchableOpacity
                  key={e}
                  style={[es.emojiBtn, e === emoji && { backgroundColor: '#1f2937' }]}
                  onPress={() => setEmoji(e)}
                >
                  <Text style={es.emojiTxt}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Name */}
            <Text style={es.label}>Display name</Text>
            <TextInput
              style={es.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#4a5568"
              maxLength={40}
            />

            {/* Bio */}
            <Text style={es.label}>Bio <Text style={es.optional}>(optional)</Text></Text>
            <TextInput
              style={[es.input, { height: 80 }]}
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

// ─── Badge row ─────────────────────────────────────────────────────────────────

function BadgeRow({ badge }: { badge: Badge }) {
  return (
    <View style={[styles.badgeRow, !badge.earned && styles.badgeRowLocked]}>
      <Text style={[styles.badgeEmoji, !badge.earned && { opacity: 0.3 }]}>{badge.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.badgeName, !badge.earned && { color: '#374151' }]}>{badge.name}</Text>
        <Text style={styles.badgeDesc}>{badge.description}</Text>
      </View>
      {badge.earned && <Text style={styles.badgeCheck}>✓</Text>}
    </View>
  );
}

// ─── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Profile screen ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [cries, setCries] = useState<Cry[]>([]);
  const [editing, setEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadProfile().then(setProfile);
      loadCries().then(setCries);
    }, [])
  );

  async function handleSave(updated: Profile) {
    await saveProfile(updated);
    setProfile(updated);
    setEditing(false);
  }

  const badges = computeBadges(cries);
  const streak = computeStreak(cries);
  const earnedCount = badges.filter(b => b.earned).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn}>
          <Text style={styles.editTxt}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={() => setEditing(true)}>
            <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
              <Text style={styles.avatarEmoji}>{profile.avatarEmoji}</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.displayName}>{profile.displayName}</Text>
          {profile.bio ? (
            <Text style={styles.bio}>{profile.bio}</Text>
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)}>
              <Text style={styles.bioPlaceholder}>Add a bio…</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCell value={cries.length} label="Cries" />
          <View style={styles.statDivider} />
          <StatCell value={streak} label="Streak" />
          <View style={styles.statDivider} />
          <StatCell value={0} label="Following" />
          <View style={styles.statDivider} />
          <StatCell value={0} label="Followers" />
        </View>

        {/* Badges */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Badges</Text>
            <Text style={styles.sectionMeta}>{earnedCount}/{badges.length}</Text>
          </View>
          <View style={styles.badgeList}>
            {badges.map(b => <BadgeRow key={b.id} badge={b} />)}
          </View>
        </View>
      </ScrollView>

      {editing && (
        <EditModal
          profile={profile}
          onSave={handleSave}
          onClose={() => setEditing(false)}
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
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  avatarEmoji: { fontSize: 44 },
  displayName: { color: '#e2e8f0', fontSize: 22, fontWeight: '700' },
  bio: { color: '#64748b', fontSize: 14, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  bioPlaceholder: { color: '#374151', fontSize: 14, fontStyle: 'italic' },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 24,
    backgroundColor: '#111827',
    borderRadius: 16, borderWidth: 1, borderColor: '#1f2937',
    paddingVertical: 16,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  statLabel: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace' },
  statDivider: { width: 1, height: 30, backgroundColor: '#1f2937' },

  section: { marginHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#94a3b8', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' },
  sectionMeta: { color: '#374151', fontSize: 12, fontFamily: 'monospace' },

  badgeList: {
    backgroundColor: '#111827', borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937', overflow: 'hidden',
  },
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

// ─── Edit modal styles ────────────────────────────────────────────────────────

const es = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#1f2937',
    maxHeight: '90%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#374151', alignSelf: 'center', marginTop: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  sheetTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  cancel: { color: '#4a5568', fontSize: 15 },
  save: { color: '#6fe0e6', fontSize: 15, fontWeight: '700' },
  body: { padding: 20, gap: 8, paddingBottom: 32 },
  avatarPreview: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 8,
  },
  avatarPreviewEmoji: { fontSize: 36 },
  label: { color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  optional: { color: '#4a5568', textTransform: 'none' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSelected: { borderWidth: 3, borderColor: '#fff' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  emojiBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  emojiTxt: { fontSize: 26 },
  input: {
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, padding: 12, color: '#e2e8f0', fontSize: 15, marginTop: 6,
  },
});
