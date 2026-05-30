import { StyleSheet, View, Text } from 'react-native';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>👤</Text>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.sub}>Badges & stats coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emoji: { fontSize: 48 },
  title: { color: '#6fe0e6', fontSize: 20, fontWeight: '700' },
  sub: { color: '#4a5568', fontSize: 14, fontFamily: 'monospace' },
});
