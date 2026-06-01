import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert,
  ActivityIndicator, Switch, TextInput, Modal, Share, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadCries } from '../../lib/storage';
import {
  getProfileSettings, updateProfileSettings, getBlockedUsers,
  unblockUser,
  ProfileSettings, BlockedUser,
} from '../../lib/social';
import { clearPushToken } from '../../lib/notifications';
import { checkPremium } from '../../lib/purchases';
import { useTheme, THEMES } from '../../lib/themes';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.section}>{text}</Text>;
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function SettingsRow({ label, value, danger, onPress, children }: {
  label: string; value?: string; danger?: boolean; onPress?: () => void; children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !children}
    >
      <Text style={[styles.rowLabel, danger && { color: '#ef6f6f' }]}>{label}</Text>
      {children ?? (
        value !== undefined
          ? <Text style={[styles.rowValue, danger && { color: '#ef6f6f' }]}>{value}</Text>
          : <Text style={[styles.rowChevron, danger && { color: '#ef6f6f' }]}>›</Text>
      )}
    </TouchableOpacity>
  );
}

function ToggleRow({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#1f2937', true: '#6fe0e6' }}
        thumbColor="#e2e8f0"
      />
    </View>
  );
}

function Avatar({ uri, size = 36 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.45 }}>💧</Text>
    </View>
  );
}

// ─── Visibility labels ────────────────────────────────────────────────────────

const VISIBILITY_LABELS: Record<ProfileSettings['profile_visibility'], string> = {
  everyone:  '🌍  Everyone',
  followers: '👥  Friends only (mutual follows)',
  only_me:   '🔒  Only me',
};

// ─── Main screen ──────────────────────────────────────────────────────────────

const DEFAULT_NOTIF_PREFS: ProfileSettings['notification_preferences'] = {
  new_cries_from_following: true,
  new_likes: true,
  new_comments: true,
  new_followers: true,
  friend_requests: true,
};

export default function SettingsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  // Privacy settings
  const [profileVisibility, setProfileVisibility] =
    useState<ProfileSettings['profile_visibility']>('everyone');
  const [allowComments, setAllowComments] = useState(true);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] =
    useState<ProfileSettings['notification_preferences']>(DEFAULT_NOTIF_PREFS);

  // Blocked users
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);

  // Report a problem modal
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

  // Visibility dropdown open
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);

  // ── Load settings on focus ──
  useFocusEffect(useCallback(() => {
    if (!session) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [settings, blocked, premium] = await Promise.all([
        getProfileSettings(),
        getBlockedUsers(),
        checkPremium(),
      ]);
      if (settings) {
        setProfileVisibility(settings.profile_visibility);
        setAllowComments(settings.allow_comments);
        setNotifPrefs({ ...DEFAULT_NOTIF_PREFS, ...settings.notification_preferences });
      }
      setBlockedUsers(blocked);
      setIsPremium(premium);
      setLoading(false);
    })();
  }, [session]));

  // ── Auto-save privacy settings ──
  async function saveVisibility(v: ProfileSettings['profile_visibility']) {
    setProfileVisibility(v);
    setShowVisibilityPicker(false);
    await updateProfileSettings({ profile_visibility: v });
  }

  async function toggleComments(v: boolean) {
    setAllowComments(v);
    await updateProfileSettings({ allow_comments: v });
  }

  async function toggleNotif(
    key: keyof ProfileSettings['notification_preferences'],
    value: boolean,
  ) {
    const next = { ...notifPrefs, [key]: value };
    setNotifPrefs(next);
    await updateProfileSettings({ notification_preferences: next });
  }

  // ── Export my data ──
  async function handleExport() {
    try {
      const cries = await loadCries();
      const { data: { session: s } } = await supabase.auth.getSession();
      const payload = {
        exported_at: new Date().toISOString(),
        user_id: s?.user.id,
        email: s?.user.email,
        cries,
      };
      await Share.share({
        message: JSON.stringify(payload, null, 2),
        title: 'My Teardrop Data',
      });
    } catch {
      Alert.alert('Export failed', 'Could not export your data. Please try again.');
    }
  }

  // ── Report a problem ──
  async function submitReport() {
    if (!reportText.trim()) return;
    setSendingReport(true);
    const { data: { session: s } } = await supabase.auth.getSession();
    await supabase.from('reports').insert({
      reporter_id: s?.user.id,
      reported_type: 'app',
      reported_id: s?.user.id ?? 'unknown',
      reason: reportText.trim(),
    });
    setSendingReport(false);
    setReportText('');
    setShowReport(false);
    Alert.alert('Thanks!', 'Your report has been submitted.');
  }

  // ── Unblock user ──
  async function handleUnblock(userId: string, username: string) {
    Alert.alert('Unblock', `Unblock @${username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          await unblockUser(userId);
          setBlockedUsers(prev => prev.filter(u => u.id !== userId));
        },
      },
    ]);
  }

  // ── Logout ──
  async function handleLogout() {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out', style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await clearPushToken();
          await supabase.auth.signOut();
          setLoggingOut(false);
        },
      },
    ]);
  }

  // ── Delete account ──
  async function performDelete() {
    if (!session) return;
    setDeleting(true);
    try {
      const { data: profile } = await supabase
        .from('profiles').select('avatar_uri').eq('id', session.user.id).single();
      if (profile?.avatar_uri) {
        try {
          const url = new URL(profile.avatar_uri.split('?')[0]);
          const parts = url.pathname.split('/avatars/');
          if (parts.length > 1) await supabase.storage.from('avatars').remove([parts[1]]);
        } catch { /* non-fatal */ }
      }
      const { data: cries } = await supabase
        .from('cries').select('photo_uri, audio_uri').eq('user_id', session.user.id);
      if (cries) {
        for (const cry of cries) {
          for (const uriField of [cry.photo_uri, cry.audio_uri]) {
            if (!uriField) continue;
            try {
              const url = new URL(uriField.split('?')[0]);
              const path = url.pathname;
              for (const bucket of ['cry-media', 'photos', 'audio']) {
                if (path.includes(`/${bucket}/`)) {
                  await supabase.storage.from(bucket).remove([path.split(`/${bucket}/`)[1]]);
                  break;
                }
              }
            } catch { /* non-fatal */ }
          }
        }
      }
      const { error: rpcError } = await supabase.rpc('delete_user_account');
      if (rpcError) throw rpcError;
      await AsyncStorage.multiRemove(['teardrop_cries', 'teardrop_profile']);
      await supabase.auth.signOut();
    } catch (err: any) {
      setDeleting(false);
      Alert.alert('Deletion failed', err?.message ?? 'Something went wrong.');
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account, cries, photos and audio. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue', style: 'destructive',
          onPress: () => Alert.alert(
            'Last chance',
            'Are you absolutely sure? All your data will be permanently erased.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete everything', style: 'destructive', onPress: performDelete },
            ],
          ),
        },
      ],
    );
  }

  // ── Render ──
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#6fe0e6" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>

          {/* Account */}
          <SectionLabel text="Account" />
          <SettingsGroup>
            {session ? (
              <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}>
                <Text style={styles.rowLabel}>Logged in as</Text>
                <Text style={styles.rowValue} numberOfLines={1}>{session.user.email}</Text>
              </View>
            ) : null}
          </SettingsGroup>

          {/* Privacy */}
          <SectionLabel text="Privacy" />
          <SettingsGroup>
            {/* Profile visibility */}
            <SettingsRow
              label="Profile visibility"
              value={VISIBILITY_LABELS[profileVisibility]}
              onPress={() => setShowVisibilityPicker(true)}
            />
            <ToggleRow
              label="Allow comments"
              value={allowComments}
              onChange={toggleComments}
            />
            <SettingsRow
              label="Close Friends"
              value="Manage list ›"
              onPress={() => router.push('/close-friends')}
            />
            <SettingsRow
              label="Blocked users"
              value={blockedUsers.length > 0 ? `${blockedUsers.length} blocked` : 'None'}
              onPress={() => setShowBlocked(true)}
            />
          </SettingsGroup>

          {/* Notifications */}
          <SectionLabel text="Notifications" />
          <SettingsGroup>
            <ToggleRow
              label="New cries from people I follow"
              value={notifPrefs.new_cries_from_following}
              onChange={v => toggleNotif('new_cries_from_following', v)}
            />
            <ToggleRow
              label="New likes on my cries"
              value={notifPrefs.new_likes}
              onChange={v => toggleNotif('new_likes', v)}
            />
            <ToggleRow
              label="New comments on my cries"
              value={notifPrefs.new_comments}
              onChange={v => toggleNotif('new_comments', v)}
            />
            <ToggleRow
              label="New followers"
              value={notifPrefs.new_followers}
              onChange={v => toggleNotif('new_followers', v)}
            />
            <ToggleRow
              label="Friend requests"
              value={notifPrefs.friend_requests}
              onChange={v => toggleNotif('friend_requests', v)}
            />
          </SettingsGroup>

          {/* Premium */}
          <SectionLabel text="Premium" />
          <SettingsGroup>
            {isPremium ? (
              <>
                <View style={[styles.row, { gap: 8 }]}>
                  <Text style={styles.rowLabel}>Teardrop Pro</Text>
                  <Text style={{ color: '#6fe0e6', fontSize: 13, fontWeight: '700' }}>💎 Active</Text>
                </View>
                <SettingsRow
                  label={`Theme: ${theme.emoji} ${theme.name}`}
                  onPress={() => setShowThemePicker(true)}
                />
                <SettingsRow
                  label="Manage subscription"
                  value="Google Play ›"
                  onPress={() => Alert.alert('Manage subscription', 'Open Google Play → Subscriptions to manage or cancel your plan.')}
                />
              </>
            ) : (
              <>
                <SettingsRow
                  label="Upgrade to Pro 💎"
                  value="Unlock features ›"
                  onPress={() => router.push('/paywall')}
                />
                <SettingsRow
                  label="Custom themes"
                  value="Premium only"
                  onPress={() => router.push('/paywall')}
                />
              </>
            )}
          </SettingsGroup>

          {/* Data */}
          <SectionLabel text="Data" />
          <SettingsGroup>
            <SettingsRow label="Export my data" onPress={handleExport} />
          </SettingsGroup>

          {/* About */}
          <SectionLabel text="About" />
          <SettingsGroup>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
            <SettingsRow label="Report a problem" onPress={() => setShowReport(true)} />
          </SettingsGroup>

          {/* Session */}
          {session ? (
            <>
              <SectionLabel text="Session" />
              <SettingsGroup>
                <TouchableOpacity style={styles.row} onPress={handleLogout} disabled={loggingOut} activeOpacity={0.7}>
                  {loggingOut
                    ? <ActivityIndicator color="#ef6f6f" />
                    : <Text style={[styles.rowLabel, { color: '#ef6f6f' }]}>Log out</Text>
                  }
                </TouchableOpacity>
              </SettingsGroup>
            </>
          ) : null}

          {/* Danger Zone */}
          {session ? (
            <>
              <SectionLabel text="Danger Zone" />
              <SettingsGroup>
                <TouchableOpacity style={styles.row} onPress={handleDeleteAccount} disabled={deleting} activeOpacity={0.7}>
                  {deleting
                    ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <ActivityIndicator size="small" color="#ef4444" />
                        <Text style={[styles.rowLabel, { color: '#ef4444' }]}>Deleting account…</Text>
                      </View>
                    )
                    : <Text style={[styles.rowLabel, { color: '#ef4444' }]}>Delete Account</Text>
                  }
                  {!deleting && <Text style={[styles.rowChevron, { color: '#ef4444' }]}>›</Text>}
                </TouchableOpacity>
              </SettingsGroup>
              <Text style={styles.dangerNote}>
                Permanently deletes your account, all cries, photos, audio and profile data.
              </Text>
            </>
          ) : null}

        </ScrollView>
      )}

      {/* ── Profile visibility picker modal ── */}
      <Modal visible={showVisibilityPicker} transparent animationType="fade" onRequestClose={() => setShowVisibilityPicker(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowVisibilityPicker(false)} />
        <View style={styles.pickerCard}>
          <Text style={styles.pickerTitle}>Profile visibility</Text>
          {(['everyone', 'followers', 'only_me'] as const).map(v => (
            <TouchableOpacity
              key={v}
              style={[styles.pickerOption, profileVisibility === v && styles.pickerOptionActive]}
              onPress={() => saveVisibility(v)}
            >
              <Text style={[styles.pickerOptionTxt, profileVisibility === v && styles.pickerOptionTxtActive]}>
                {VISIBILITY_LABELS[v]}
              </Text>
              {profileVisibility === v && <Text style={styles.pickerCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* ── Blocked users modal ── */}
      <Modal visible={showBlocked} transparent animationType="slide" onRequestClose={() => setShowBlocked(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowBlocked(false)} />
        <SafeAreaView edges={['bottom']} style={styles.sheetContainer}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Blocked users</Text>
              <TouchableOpacity onPress={() => setShowBlocked(false)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {blockedUsers.length === 0 ? (
              <Text style={styles.emptyText}>You haven't blocked anyone.</Text>
            ) : (
              <ScrollView>
                {blockedUsers.map(u => (
                  <View key={u.id} style={styles.blockedRow}>
                    <Avatar uri={u.avatar_uri} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.blockedName}>{u.display_name}</Text>
                      <Text style={styles.blockedHandle}>@{u.username}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.unblockBtn}
                      onPress={() => handleUnblock(u.id, u.username)}
                    >
                      <Text style={styles.unblockTxt}>Unblock</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Theme picker modal ── */}
      <Modal visible={showThemePicker} transparent animationType="fade" onRequestClose={() => setShowThemePicker(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowThemePicker(false)} />
        <View style={styles.pickerCard}>
          <Text style={styles.pickerTitle}>Choose theme</Text>
          {THEMES.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.pickerOption, theme.id === t.id && styles.pickerOptionActive]}
              onPress={() => { setTheme(t); setShowThemePicker(false); }}
            >
              <View style={[styles.themeCircle, { backgroundColor: t.accent }]} />
              <Text style={[styles.pickerOptionTxt, theme.id === t.id && { color: t.accent }]}>
                {t.emoji}  {t.name}
                {t.premium && !isPremium ? '  🔒' : ''}
              </Text>
              {theme.id === t.id && <Text style={[styles.pickerCheck, { color: t.accent }]}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* ── Report a problem modal ── */}
      <Modal visible={showReport} transparent animationType="slide" onRequestClose={() => setShowReport(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowReport(false)} />
        <SafeAreaView edges={['bottom']} style={styles.sheetContainer}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Report a problem</Text>
              <TouchableOpacity onPress={() => setShowReport(false)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.reportHint}>
              Describe the problem and we'll look into it.
            </Text>
            <TextInput
              style={styles.reportInput}
              value={reportText}
              onChangeText={setReportText}
              placeholder="What went wrong?"
              placeholderTextColor="#4a5568"
              multiline
              maxLength={1000}
              textAlignVertical="top"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.reportSubmit, (!reportText.trim() || sendingReport) && { opacity: 0.4 }]}
              onPress={submitReport}
              disabled={!reportText.trim() || sendingReport}
            >
              {sendingReport
                ? <ActivityIndicator color="#0d1117" />
                : <Text style={styles.reportSubmitTxt}>Send report</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  headerTitle: { color: '#e2e8f0', fontSize: 26, fontWeight: '700' },
  content: { paddingBottom: 48 },

  section: {
    color: '#4a5568', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase',
    paddingHorizontal: 20, paddingTop: 28, paddingBottom: 8,
  },
  group: {
    backgroundColor: '#111827',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1f2937',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  rowLabel: { color: '#e2e8f0', fontSize: 15, flex: 1, flexWrap: 'wrap' },
  rowValue: { color: '#4a5568', fontSize: 14, maxWidth: '55%', textAlign: 'right' },
  rowChevron: { color: '#4a5568', fontSize: 20 },
  dangerNote: {
    color: '#374151', fontSize: 11, paddingHorizontal: 20, paddingTop: 8, lineHeight: 16,
  },

  // Modal backdrop
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },

  // Visibility picker
  pickerCard: {
    position: 'absolute', bottom: 40, left: 20, right: 20,
    backgroundColor: '#111827', borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937',
    overflow: 'hidden',
  },
  pickerTitle: {
    color: '#4a5568', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#1f2937',
  },
  pickerOptionActive: { backgroundColor: '#6fe0e610' },
  pickerOptionTxt: { color: '#94a3b8', fontSize: 16 },
  pickerOptionTxtActive: { color: '#6fe0e6' },
  pickerCheck: { color: '#6fe0e6', fontSize: 16, fontWeight: '700' },
  themeCircle: { width: 18, height: 18, borderRadius: 9, marginRight: 4 },

  // Bottom sheet
  sheetContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#1f2937',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24,
    maxHeight: 560,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#374151', alignSelf: 'center', marginBottom: 16,
  },
  sheetHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },
  sheetClose: { color: '#4a5568', fontSize: 20, padding: 4 },
  emptyText: { color: '#4a5568', fontSize: 14, fontFamily: 'monospace', textAlign: 'center', marginTop: 24 },

  // Blocked users list
  blockedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  blockedName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  blockedHandle: { color: '#4a5568', fontSize: 12 },
  unblockBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 14, borderWidth: 1, borderColor: '#6fe0e6',
  },
  unblockTxt: { color: '#6fe0e6', fontSize: 13, fontWeight: '600' },

  // Report problem
  reportHint: { color: '#4a5568', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  reportInput: {
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, padding: 14, color: '#e2e8f0',
    fontSize: 15, minHeight: 120, fontFamily: 'monospace',
    marginBottom: 16,
  },
  reportSubmit: {
    backgroundColor: '#6fe0e6', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  reportSubmitTxt: { color: '#0d1117', fontSize: 15, fontWeight: '700' },
});
