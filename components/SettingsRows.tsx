/**
 * The building blocks of a settings screen, pulled out of the Settings tab so
 * the sub-screens can use the same ones.
 *
 * They were private to app/(tabs)/settings.tsx, which meant every new settings
 * surface either duplicated them or lived on the one screen. Settings had
 * grown to the point where visibility and notifications each deserved their
 * own page, and neither could have one without this.
 */
import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export function SectionLabel({ text }: { text: string }) {
  return <Text style={s.section}>{text}</Text>;
}

export function SettingsGroup({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

export function SettingsRow({ label, value, danger, onPress, children }: {
  label: string; value?: string; danger?: boolean; onPress?: () => void; children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !children}
    >
      <Text style={[s.rowLabel, danger && { color: '#ef6f6f' }]}>{label}</Text>
      {children ?? (
        value !== undefined
          ? <Text style={[s.rowValue, danger && { color: '#ef6f6f' }]}>{value}</Text>
          : <Text style={[s.rowChevron, danger && { color: '#ef6f6f' }]}>›</Text>
      )}
    </TouchableOpacity>
  );
}

export function ToggleRow({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {hint ? <Text style={s.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#1f2937', true: '#6fe0e6' }}
        thumbColor="#e2e8f0"
      />
    </View>
  );
}

/** Header shared by the settings sub-screens. */
export function SubScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>
      {children}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#e2e8f0', fontSize: 22 },
  headerTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
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
  rowLabel: { color: '#e2e8f0', fontSize: 15, flexWrap: 'wrap' },
  // Room for a line of explanation under a toggle. Several of these settings
  // are about who can see what, and a bare label leaves people guessing.
  rowHint: { color: '#4a5568', fontSize: 12, lineHeight: 17, marginTop: 3 },
  rowValue: { color: '#4a5568', fontSize: 14, maxWidth: '55%', textAlign: 'right' },
  rowChevron: { color: '#4a5568', fontSize: 20 },
});
