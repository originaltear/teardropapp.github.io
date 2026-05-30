import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>💧</Text>
      <Text style={styles.title}>Teardrop</Text>
      <Text style={styles.subtitle}>Map Your Emotional Journey</Text>
      <StatusBar style="light" />
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
  emoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#6fe0e6',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#4a5568',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
});
