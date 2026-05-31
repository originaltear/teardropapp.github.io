import { useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

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
            // RootNav listener handles redirect to login
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
          <SettingsRow label="Version" value="0.3.0" />
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
        <Text style={styles.section}>Danger Zone</Text>
        <View style={styles.group}>
          <SettingsRow label="Request account deletion" soon danger />
        </View>
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
});
