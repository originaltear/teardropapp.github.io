import { useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

function SettingsRow({ label, value, soon, danger, onPress }: {
  label: string; value?: string; soon?: boolean; danger?: boolean; onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={soon ? 1 : 0.7}
      disabled={soon}
      onPress={onPress}
    >
      <Text style={[styles.rowLabel, danger && { color: '#ef6f6f' }]}>{label}</Text>
      {soon
        ? <Text style={styles.soon}>Coming soon</Text>
        : value
          ? <Text style={styles.rowValue}>{value}</Text>
          : <Text style={[styles.rowChevron, danger && { color: '#ef6f6f' }]}>›</Text>
      }
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { session } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleLogout() {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            await supabase.auth.signOut();
            setLoggingOut(false);
          },
        },
      ],
    );
  }

  async function performDelete() {
    if (!session) return;
    setDeleting(true);

    try {
      // 1. Delete avatar from storage
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_uri')
        .eq('id', session.user.id)
        .single();

      if (profile?.avatar_uri) {
        try {
          // Extract path from URL: .../avatars/<userId>/avatar-xxx.jpg
          const url = new URL(profile.avatar_uri.split('?')[0]);
          const parts = url.pathname.split('/avatars/');
          if (parts.length > 1) {
            await supabase.storage.from('avatars').remove([parts[1]]);
          }
        } catch {
          // Storage cleanup failure is non-fatal
        }
      }

      // 2. Delete cry photos + audio from storage
      const { data: cries } = await supabase
        .from('cries')
        .select('photo_uri, audio_uri')
        .eq('user_id', session.user.id);

      if (cries && cries.length > 0) {
        for (const cry of cries) {
          for (const uriField of [cry.photo_uri, cry.audio_uri]) {
            if (!uriField) continue;
            try {
              const url = new URL(uriField.split('?')[0]);
              const path = url.pathname;
              // Try both 'cry-media' and any bucket prefix patterns
              const buckets = ['cry-media', 'photos', 'audio'];
              for (const bucket of buckets) {
                if (path.includes(`/${bucket}/`)) {
                  const filePath = path.split(`/${bucket}/`)[1];
                  await supabase.storage.from(bucket).remove([filePath]);
                  break;
                }
              }
            } catch {
              // Non-fatal
            }
          }
        }
      }

      // 3. Call RPC to delete all DB data (including auth.users)
      const { error: rpcError } = await supabase.rpc('delete_user_account');
      if (rpcError) throw rpcError;

      // 4. Clear local storage
      await AsyncStorage.multiRemove(['teardrop_cries', 'teardrop_profile']);

      // 5. Sign out (auth user is already deleted, this clears the local session)
      await supabase.auth.signOut();
    } catch (err: any) {
      setDeleting(false);
      Alert.alert(
        'Deletion failed',
        err?.message ?? 'Something went wrong. Please try again.',
      );
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, all your cries, photos, audio and profile data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            // Second confirmation to prevent accidental taps
            Alert.alert(
              'Last chance',
              'Are you absolutely sure? All your data will be permanently erased.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete everything', style: 'destructive', onPress: performDelete },
              ],
            );
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Account */}
        <Text style={styles.section}>Account</Text>
        <View style={styles.group}>
          {session ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Logged in as</Text>
              <Text style={styles.rowValue} numberOfLines={1}>{session.user.email}</Text>
            </View>
          ) : null}
        </View>

        {/* Privacy */}
        <Text style={styles.section}>Privacy</Text>
        <View style={styles.group}>
          <SettingsRow label="Profile visibility" soon />
          <SettingsRow label="Allow comments" soon />
        </View>

        {/* Data */}
        <Text style={styles.section}>Data</Text>
        <View style={styles.group}>
          <SettingsRow label="Export my data" soon />
        </View>

        {/* About */}
        <Text style={styles.section}>About</Text>
        <View style={styles.group}>
          <SettingsRow label="Version" value="1.0.0" />
          <SettingsRow label="Report a problem" soon />
        </View>

        {/* Session */}
        {session ? (
          <>
            <Text style={styles.section}>Session</Text>
            <View style={styles.group}>
              <TouchableOpacity
                style={styles.row}
                onPress={handleLogout}
                disabled={loggingOut}
                activeOpacity={0.7}
              >
                {loggingOut
                  ? <ActivityIndicator color="#ef6f6f" />
                  : <Text style={[styles.rowLabel, { color: '#ef6f6f' }]}>Log out</Text>
                }
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {/* Danger zone */}
        {session ? (
          <>
            <Text style={styles.section}>Danger Zone</Text>
            <View style={styles.group}>
              <TouchableOpacity
                style={styles.row}
                onPress={handleDeleteAccount}
                disabled={deleting}
                activeOpacity={0.7}
              >
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
            </View>
            <Text style={styles.dangerNote}>
              Permanently deletes your account, all cries, photos, audio and profile data.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  headerTitle: { color: '#e2e8f0', fontSize: 26, fontWeight: '700' },
  content: { paddingBottom: 40 },
  section: {
    color: '#4a5568', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase',
    paddingHorizontal: 20, paddingTop: 28, paddingBottom: 8,
  },
  group: { backgroundColor: '#111827', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1f2937' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  rowLabel: { color: '#e2e8f0', fontSize: 15 },
  rowValue: { color: '#4a5568', fontSize: 14, maxWidth: '55%', textAlign: 'right' },
  rowChevron: { color: '#4a5568', fontSize: 20 },
  soon: { color: '#374151', fontSize: 12, fontFamily: 'monospace' },
  dangerNote: {
    color: '#374151', fontSize: 11, paddingHorizontal: 20, paddingTop: 8,
    lineHeight: 16,
  },
});
