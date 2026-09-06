/**
 * EmotionIcon — an emotion drawn as its own teardrop, for the places where a
 * feeling is given real room.
 *
 * Sizing rule: use this at 26pt and up. Below that the motif inside the drop
 * stops being visible and the icon degrades into a coloured blob, at which
 * point the emoji is the better choice — it stays legible small and it carries
 * meaning without relying on colour, which matters for anyone who reads the
 * palette poorly. The dense list rows deliberately still use emoji.
 */
import Svg, { Path } from 'react-native-svg';
import { EMOTION_ICONS, ICON_VIEWBOX, TEAR_SILHOUETTE } from '../lib/emotion-icons';
import { emotionById } from '../lib/emotions';

/** Artwork is drawn 3:4, the same ratio as the map pin. */
export const ICON_RATIO = 0.75;

export function EmotionIcon({
  emotion,
  size,
  label,
}: {
  emotion: string;
  /** Height in points. Width follows at 3:4. */
  size: number;
  /** Screen readers get the emotion's name; without it the icon is decorative. */
  label?: string;
}) {
  const e = emotionById(emotion);
  const parts = e ? EMOTION_ICONS[e.id] : undefined;
  const w = size * ICON_RATIO;

  // No artwork for this emotion: fall back to the bare drop in its own colour
  // rather than rendering nothing and leaving a hole in the layout.
  if (!parts) {
    return (
      <Svg width={w} height={size} viewBox={ICON_VIEWBOX} accessibilityLabel={label}>
        <Path d={TEAR_SILHOUETTE} fill={e?.color ?? '#6fe0e6'} />
      </Svg>
    );
  }

  return (
    <Svg width={w} height={size} viewBox={ICON_VIEWBOX} accessibilityLabel={label}>
      {parts.map((part, i) => (
        <Path key={i} d={part.d} fill={part.fill} />
      ))}
    </Svg>
  );
}

/**
 * A single intensity drop. Filled when it counts towards the score, outlined
 * when it does not — an outline rather than a pale fill, so an empty drop can
 * never be mistaken for a white one.
 */
export function Tear({ size, filled, color }: { size: number; filled: boolean; color: string }) {
  return (
    <Svg width={size * ICON_RATIO} height={size} viewBox={ICON_VIEWBOX}>
      <Path
        d={TEAR_SILHOUETTE}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 0 : 34}
        opacity={filled ? 1 : 0.45}
      />
    </Svg>
  );
}
