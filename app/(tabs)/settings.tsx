// Platform-specific: iOS + Android (subscription management differs per store)
import { useCallback, useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert,
  ActivityIndicator, Switch, TextInput, Modal, Share, Image,
  Platform, Linking,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
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
import {
  getLinkedIdentities, linkProvider, unlinkProvider, providerLabel,
  type LinkableProvider,
} from '../../lib/account-linking';
import type { UserIdentity } from '@supabase/supabase-js';
import { validateUsername, isUsernameTaken, updateUsername } from '../../lib/username';
import { useTheme, THEMES } from '../../lib/themes';
import { loadHapticsPref, setHapticsEnabled, tapLight } from '../../lib/haptics';
import { isPrivacyOptionsRequired, showPrivacyOptions } from '../../lib/ads';
import { SUPPORT_EMAIL, openSupportEmail } from '../guidelines';
import { UiIcon } from '../../components/UiIcon';
import { Avatar } from '../../components/Avatar';

// Hosted privacy policy (same target as the paywall's legal links). Google Play
// requires an accessible privacy policy for apps that collect account data, so
// it's surfaced in Settings as well as at purchase time.
const PRIVACY_URL = 'https://teardropapp.com/privacy-policy.html';

// Apple's standard EULA, the same one the paywall links at purchase time.
// Guideline 1.2 wants the terms reachable from inside the app, not only at the
// moment someone is about to pay.
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

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



// Providers a user can link to their account in addition to how they signed up.
const LINKABLE_PROVIDERS: LinkableProvider[] = ['apple', 'google'];

// ─── Main screen ──────────────────────────────────────────────────────────────

const DEFAULT_NOTIF_PREFS: ProfileSettings['notification_preferences'] = {
  new_cries_from_following: true,
  new_likes: true,
  new_comments: true,
  new_followers: true,
  friend_requests: true,
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [adPrivacyAvailable, setAdPrivacyAvailable] = useState(false);

  // Report a problem modal
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

  // Account linking (Supabase Auth identities)
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [linkingProvider, setLinkingProvider] = useState<LinkableProvider | null>(null);

  // Username editing
  const [username, setUsername] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameErr, setUsernameErr] = useState<string | null>(null);
  const [savingUsername, setSavingUsername] = useState(false);
  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load settings on focus ──
  useFocusEffect(useCallback(() => {
    if (!session) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        // Visibility and notification preferences now load on their own pages,
        // so this screen no longer fetches them.
        const [premium, ids, profileRow] = await Promise.all([
          checkPremium(),
          getLinkedIdentities(),
          supabase.from('profiles').select('username').eq('id', session.user.id).single(),
        ]);
        setIsPremium(premium);
        setIdentities(ids);
        setUsername(profileRow.data?.username ?? null);
      } catch (e) {
        console.warn('[settings] load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session]));

  // ── Haptics preference (local, works for guests too) ──
  useEffect(() => {
    loadHapticsPref().then(setHapticsOn);
    // Show the ad-consent entry point only where UMP requires it (EEA/US states).
    isPrivacyOptionsRequired().then(setAdPrivacyAvailable).catch(() => {});
  }, []);

  // ── Real-time username availability check (modal) ──
  useEffect(() => {
    if (!showUsernameModal) return;
    setUsernameAvailable(null);
    setUsernameErr(null);
    const u = newUsername.toLowerCase().trim();
    if (!u || u === username) return;            // unchanged or empty — nothing to check
    const err = validateUsername(u);
    if (err) { setUsernameErr(err); return; }

    setCheckingUsername(true);
    if (usernameDebounce.current) clearTimeout(usernameDebounce.current);
    usernameDebounce.current = setTimeout(async () => {
      try {
        const taken = await isUsernameTaken(u);
        setUsernameAvailable(!taken);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 450);

    return () => { if (usernameDebounce.current) clearTimeout(usernameDebounce.current); };
  }, [newUsername, showUsernameModal, username]);

  function openUsernameModal() {
    setNewUsername(username ?? '');
    setUsernameAvailable(null);
    setUsernameErr(null);
    setShowUsernameModal(true);
  }

  async function handleSaveUsername() {
    const u = newUsername.toLowerCase().trim();
    if (u === username) { setShowUsernameModal(false); return; }
    setSavingUsername(true);
    const err = await updateUsername(u);
    setSavingUsername(false);
    if (err) { setUsernameErr(err); return; }
    setUsername(u);
    setShowUsernameModal(false);
    tapLight();
  }

  async function toggleHaptics(v: boolean) {
    setHapticsOn(v);
    await setHapticsEnabled(v); // applies in-memory immediately + persists
    if (v) tapLight();          // instant confirmation when turning it back on
  }

  // ── Account linking ──
  async function refreshIdentities() {
    setIdentities(await getLinkedIdentities());
  }

  async function handleLink(provider: LinkableProvider) {
    tapLight();
    setLinkingProvider(provider);
    const result = await linkProvider(provider);
    setLinkingProvider(null);
    if (result === 'success') {
      await refreshIdentities();
      // Android finishes the link asynchronously via the deep-link handler.
      if (Platform.OS === 'android') setTimeout(refreshIdentities, 1500);
    } else if (result === 'error') {
      Alert.alert(
        `Couldn't link ${providerLabel(provider)}`,
        'Please try again. If it keeps failing, this sign-in method may not be set up yet.',
      );
    }
  }

  function handleUnlink(identity: UserIdentity) {
    if (identities.length <= 1) {
      Alert.alert('Cannot unlink', 'You must keep at least one login method on your account.');
      return;
    }
    Alert.alert(
      `Unlink ${providerLabel(identity.provider)}?`,
      `You'll no longer be able to log in with ${providerLabel(identity.provider)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink', style: 'destructive', onPress: async () => {
            const result = await unlinkProvider(identity);
            if (result === 'success') await refreshIdentities();
            else Alert.alert('Unlink failed', 'Please try again.');
          },
        },
      ],
    );
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
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      // supabase-js reports failures in the result rather than throwing, so the
      // catch below never sees them. Without this check every problem report
      // was answered with "Thanks!" whether or not the row survived — and for
      // a long time none of them did, because reported_type = 'app' violated a
      // CHECK constraint that only allowed 'cry' and 'user'.
      const { error } = await supabase.from('reports').insert({
        reporter_id: s?.user.id,
        reported_type: 'app',
        reported_id: s?.user.id ?? 'unknown',
        reason: reportText.trim().slice(0, 1000),
      });
      if (error) throw error;
      setReportText('');
      setShowReport(false);
      Alert.alert('Thanks!', 'Your report has been submitted.');
    } catch {
      Alert.alert('Error', 'Could not send report. Please try again.');
    } finally {
      setSendingReport(false);
    }
  }

  // ── Logout ──
  async function handleLogout() {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out', style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            // Best-effort — a failed token clear must never trap the user in
            // a logged-in state with a spinning button.
            await clearPushToken().catch(e => console.warn('[settings] clearPushToken failed:', e));
            await supabase.auth.signOut();
          } finally {
            setLoggingOut(false);
          }
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
      // Don't surface raw Postgres/network errors to the user.
      console.warn('[settings] account deletion failed:', err?.message);
      Alert.alert(
        'Deletion failed',
        "We couldn't delete your account right now. Please check your connection and try again, or email hello.teardropapp@gmail.com if it keeps happening.",
      );
    } finally {
      setDeleting(false);
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
              <>
              <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}>
                <Text style={styles.rowLabel}>Logged in as</Text>
                <Text style={styles.rowValue} numberOfLines={1}>{session.user.email}</Text>
              </View>
              <SettingsRow
                label="Username"
                value={username ? `@${username}  ›` : 'Set username  ›'}
                onPress={openUsernameModal}
              />
              </>
            ) : (
              <SettingsRow
                label="Log in or create account"
                value="Unlock social features ›"
                onPress={() => router.push('/(auth)/login')}
              />
            )}
          </SettingsGroup>

          {/* Login methods — link additional providers to the same account */}
          {session ? (
            <>
              <SectionLabel text="Login methods" />
              <SettingsGroup>
                {LINKABLE_PROVIDERS.map(provider => {
                  const identity = identities.find(i => i.provider === provider);
                  const linked = !!identity;
                  const busy = linkingProvider === provider;
                  return (
                    <View key={provider} style={styles.row}>
                      <Text style={styles.rowLabel}>{providerLabel(provider)}</Text>
                      {busy ? (
                        <ActivityIndicator color="#6fe0e6" />
                      ) : linked ? (
                        <TouchableOpacity
                          onPress={() => handleUnlink(identity!)}
                          disabled={identities.length <= 1}
                          activeOpacity={0.7}
                        >
                          <View style={styles.linkedRow}>
                            <UiIcon name="check" size={14} color="#4ade80" strokeWidth={2.5} />
                            <Text style={styles.linkedTxt}>
                              Linked{identities.length > 1 ? '  ·  Unlink' : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => handleLink(provider)} activeOpacity={0.7}>
                          <Text style={styles.linkTxt}>Link ›</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </SettingsGroup>
            </>
          ) : null}

          {/* Privacy / notification prefs only exist server-side — hidden for
              guests so the screen doesn't show toggles that silently no-op. */}
          {session ? (
          <>
          {/* Both of these used to be full sections here. They kept growing,
              and they were competing for attention with vibration and theme
              colours. Each now has a page where the settings can explain
              themselves. */}
          <SectionLabel text="Privacy" />
          <SettingsGroup>
            <SettingsRow
              label="Visibility"
              value="Who can see what ›"
              onPress={() => router.push('/visibility-settings')}
            />
            <SettingsRow
              label="Notifications"
              value="What we send you ›"
              onPress={() => router.push('/notification-settings')}
            />
          </SettingsGroup>
          </>
          ) : null}

          {/* Appearance */}
          <SectionLabel text="Appearance" />
          <SettingsGroup>
            <ToggleRow label="Vibration" value={hapticsOn} onChange={toggleHaptics} />
            {isPremium ? (
              <SettingsRow
                label={`Theme: ${theme.emoji} ${theme.name}`}
                onPress={() => setShowThemePicker(true)}
              />
            ) : (
              <SettingsRow
                label="Custom themes"
                value="Premium only"
                onPress={() => router.push('/paywall')}
              />
            )}
          </SettingsGroup>

          {/* Premium — needs an account to attach the purchase to */}
          {session ? (
          <>
          <SectionLabel text="Premium" />
          <SettingsGroup>
            {isPremium ? (
              <>
                <View style={[styles.row, { gap: 8 }]}>
                  <Text style={styles.rowLabel}>Teardrop Pro</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <UiIcon name="gem" size={13} color="#6fe0e6" />
                    <Text style={{ color: '#6fe0e6', fontSize: 13, fontWeight: '700' }}>Active</Text>
                  </View>
                </View>
                <SettingsRow
                  label="Manage subscription"
                  value={Platform.OS === 'ios' ? 'App Store ›' : 'Google Play ›'}
                  onPress={() => {
                    if (Platform.OS === 'ios') {
                      Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() =>
                        Alert.alert('Manage subscription', 'Open Settings → your Apple ID → Subscriptions to manage or cancel your plan.')
                      );
                    } else {
                      Linking.openURL('https://play.google.com/store/account/subscriptions').catch(() =>
                        Alert.alert('Manage subscription', 'Open Google Play → Subscriptions to manage or cancel your plan.')
                      );
                    }
                  }}
                />
              </>
            ) : (
              <SettingsRow
                label="Upgrade to Pro"
                value="Unlock features ›"
                onPress={() => router.push('/paywall')}
              />
            )}
          </SettingsGroup>
          </>
          ) : null}

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
              <Text style={styles.rowValue}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
            </View>
            <SettingsRow
              label="Community Guidelines"
              value="›"
              onPress={() => router.push('/guidelines')}
            />
            <SettingsRow
              label="Terms of Use"
              value="›"
              onPress={() =>
                Linking.openURL(TERMS_URL).catch(() =>
                  Alert.alert('Could not open link', 'Please visit ' + TERMS_URL)
                )
              }
            />
            <SettingsRow
              label="Privacy Policy"
              value="›"
              onPress={() =>
                Linking.openURL(PRIVACY_URL).catch(() =>
                  Alert.alert('Could not open link', 'Please visit ' + PRIVACY_URL)
                )
              }
            />
            {/* Shown as an address rather than a "Contact us" link on purpose:
                Guideline 1.2 asks for published contact information, and a
                label that hides the address behind a tap is not published. */}
            <SettingsRow
              label="Contact"
              value={SUPPORT_EMAIL}
              onPress={() => openSupportEmail('Teardrop')}
            />
            {adPrivacyAvailable && (
              <SettingsRow
                label="Ad privacy options"
                value="›"
                onPress={() => { showPrivacyOptions(); }}
              />
            )}
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

      {/* ── Theme picker modal ── */}
      <Modal visible={showThemePicker} transparent animationType="fade" onRequestClose={() => setShowThemePicker(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowThemePicker(false)} />
        <View style={[styles.pickerCard, { bottom: 40 + insets.bottom }]}>
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
              {theme.id === t.id && <UiIcon name="check" size={18} color={t.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* ── Report a problem modal ── */}
      {/* Bottom-sheet structure mirrors the feed detail modal: everything in
          normal flow (backdrop flex:1 above, sheet below) — the keyboard
          padding can't move an absolutely-positioned child on Android. */}
      <Modal visible={showReport} transparent animationType="slide" onRequestClose={() => setShowReport(false)}>
        <View style={styles.sheetModalRoot}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowReport(false)} />
        <KeyboardAvoidingView behavior="padding" automaticOffset>
        <SafeAreaView edges={['bottom']}>
          <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Report a problem</Text>
              <TouchableOpacity onPress={() => setShowReport(false)}>
                <View style={styles.sheetClose}><UiIcon name="x" size={21} color="#4a5568" /></View>
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
        </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Change username */}
      <Modal visible={showUsernameModal} transparent animationType="slide" onRequestClose={() => setShowUsernameModal(false)}>
        <View style={styles.sheetModalRoot}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowUsernameModal(false)} />
        <KeyboardAvoidingView behavior="padding" automaticOffset>
        <SafeAreaView edges={['bottom']}>
          <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Change username</Text>
              <TouchableOpacity onPress={() => setShowUsernameModal(false)}>
                <View style={styles.sheetClose}><UiIcon name="x" size={21} color="#4a5568" /></View>
              </TouchableOpacity>
            </View>
            <View style={styles.usernameInputRow}>
              <Text style={styles.usernameAt}>@</Text>
              <TextInput
                style={styles.usernameInput}
                value={newUsername}
                onChangeText={t => setNewUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="yourname"
                placeholderTextColor="#4a5568"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={20}
              />
              {checkingUsername && <ActivityIndicator size="small" color="#6fe0e6" />}
            </View>
            {usernameErr
              ? <View style={styles.usernameStatusRow}>
                  <UiIcon name="x" size={14} color="#ef6f6f" strokeWidth={2.5} />
                  <Text style={styles.usernameStatusErr}>{usernameErr}</Text>
                </View>
              : usernameAvailable === true
                ? <View style={styles.usernameStatusRow}>
                    <UiIcon name="check" size={14} color="#4ade80" strokeWidth={2.5} />
                    <Text style={styles.usernameStatusOk}>@{newUsername} is available</Text>
                  </View>
                : usernameAvailable === false
                  ? <View style={styles.usernameStatusRow}>
                      <UiIcon name="x" size={14} color="#ef6f6f" strokeWidth={2.5} />
                      <Text style={styles.usernameStatusErr}>@{newUsername} is taken</Text>
                    </View>
                  : null}
            <Text style={styles.reportHint}>3–20 characters · lowercase letters, numbers and _ only</Text>
            <TouchableOpacity
              style={[
                styles.reportSubmit,
                (savingUsername || checkingUsername || usernameAvailable !== true) && { opacity: 0.4 },
              ]}
              onPress={handleSaveUsername}
              disabled={savingUsername || checkingUsername || usernameAvailable !== true}
            >
              {savingUsername
                ? <ActivityIndicator color="#0d1117" />
                : <Text style={styles.reportSubmitTxt}>Save</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
        </View>
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
  rowValue: { color: '#4a5568', fontSize: 15, maxWidth: '55%', textAlign: 'right' },
  rowChevron: { color: '#4a5568', fontSize: 20 },
  linkTxt: { color: '#6fe0e6', fontSize: 15, fontWeight: '700' },
  linkedTxt: { color: '#4ade80', fontSize: 13, fontWeight: '600' },
  linkedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  usernameInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, paddingHorizontal: 14, marginBottom: 8,
  },
  usernameAt: { color: '#6fe0e6', fontSize: 17, fontWeight: '700' },
  usernameInput: { flex: 1, paddingVertical: 14, color: '#e2e8f0', fontSize: 17, fontFamily: 'monospace' },
  usernameStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  usernameStatusOk: { color: '#4ade80', fontSize: 13 },
  usernameStatusErr: { color: '#ef6f6f', fontSize: 13 },
  dangerNote: {
    color: '#374151', fontSize: 11, paddingHorizontal: 20, paddingTop: 8, lineHeight: 16,
  },

  // Modal backdrop
  modalBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
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
  pickerOptionTxt: { color: '#94a3b8', fontSize: 17 },
  pickerOptionTxtActive: { color: '#6fe0e6' },
  themeCircle: { width: 18, height: 18, borderRadius: 9, marginRight: 4 },

  // Bottom sheet
  sheetModalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
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
  sheetClose: { padding: 4 },
  emptyText: { color: '#4a5568', fontSize: 15, fontFamily: 'monospace', textAlign: 'center', marginTop: 24 },

  // Blocked users list
  blockedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  blockedName: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  blockedHandle: { color: '#4a5568', fontSize: 13 },
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
