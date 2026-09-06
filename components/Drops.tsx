/**
 * Drops — the 1–5 teardrop intensity indicator, shared across screens.
 *
 * Drawn as the app's own teardrop rather than the 💧 emoji, so intensity is cut
 * from the same silhouette as the pins and the emotion icons. Drops that count
 * are filled; the rest are outlined. An outline, never a pale or white fill —
 * a white teardrop reads as something this app does not mean.
 */
import { View } from 'react-native';
import { Tear } from './EmotionIcon';

/** Tear Blue, the app's own. Pass `color` to tint drops to an emotion. */
const DEFAULT = '#6fe0e6';

export function Drops({
  intensity,
  size = 14,
  color = DEFAULT,
}: {
  intensity: number;
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.18 }}
      accessibilityLabel={`Intensity ${intensity} of 5`}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <Tear key={n} size={size} filled={n <= intensity} color={color} />
      ))}
    </View>
  );
}
