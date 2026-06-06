/**
 * Drops — the 1–5 teardrop intensity indicator, shared across screens.
 */
import { View, Text } from 'react-native';

export function Drops({ intensity, size = 14 }: { intensity: number; size?: number }) {
  return (
    <View
      style={{ flexDirection: 'row', gap: 2 }}
      accessibilityLabel={`Intensity ${intensity} of 5`}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: size, opacity: n <= intensity ? 1 : 0.2 }}>💧</Text>
      ))}
    </View>
  );
}
