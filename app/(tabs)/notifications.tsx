import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotificationsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🔔</Text>
        <Text style={styles.emptyTitle}>No new notifications</Text>
        <Text style={styles.emptySub}>
          Likes, comments and friend requests will appear here.
        </Text>
      </View>
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
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingHorizontal: 40,
  },
  emptyEmoji: { fontSize: 48, opacity: 0.4 },
  emptyTitle: { color: '#4a5568', fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#374151', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
