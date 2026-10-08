/**
 * Three teardrops that fill, one per cry, up to the number a recap needs.
 *
 * Shared by the profile's "Road to Your Year in Tears" card and the waiting
 * screen behind /wrapped, so both count the same way. Empty drops are outlines
 * and filled ones take the accent colour; the white drop is never drawn solid.
 */
import { View, StyleSheet } from 'react-native';
import { Tear } from './EmotionIcon';
import { MIN_CRIES_FOR_WRAPPED } from '../lib/wrapped';

export function TearProgress({ count, color, size = 28 }: {
  count: number;
  color: string;
  size?: number;
}) {
  const filled = Math.min(count, MIN_CRIES_FOR_WRAPPED);
  return (
    <View
      style={[s.row, { gap: size * 0.35 }]}
      accessible
      accessibilityLabel={`${filled} of ${MIN_CRIES_FOR_WRAPPED}`}
    >
      {Array.from({ length: MIN_CRIES_FOR_WRAPPED }, (_, i) => (
        <Tear key={i} size={size} filled={i < filled} color={color} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
