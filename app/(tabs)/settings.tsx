import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function SettingsRow({ label, value, soon }: { label: string; value?: string; soon?: boolean }) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={soon ? 1 : 0.7} disabled={soon}>
      <Text style={styles.rowLabel}>{label}</Text>
      {soon
        ? <Text style={styles.soon}>Coming soon</Text>
        : value
          ? <Text style={styles.rowValue}>{value}</Text>
          : <Text style={styles.rowChevron}>›</Text>
      }
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Account */}
        <Text style={styles.section}>Account</Text>
        <View style={styles.group}>
          <SettingsRow label="Log in / Sign up" soon />
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
          <SettingsRow label="Version" value="0.1.0" />
          <SettingsRow label="Report a problem" soon />
        </View>

        {/* Danger zone */}
        <Text style={styles.section}>Danger Zone</Text>
        <View style={styles.group}>
          <SettingsRow label="Request account deletion" soon />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerTitle: { color: '#e2e8f0', fontSize: 26, fontWeight: '700' },
  content: { paddingBottom: 40 },
  section: {
    color: '#4a5568',
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 8,
  },
  group: {
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1f2937',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  rowLabel: { color: '#e2e8f0', fontSize: 15 },
  rowValue: { color: '#4a5568', fontSize: 14 },
  rowChevron: { color: '#4a5568', fontSize: 20 },
  soon: { color: '#374151', fontSize: 12, fontFamily: 'monospace' },
});
