/**
 * AchievementIcon — the drawn artwork for one achievement.
 *
 * Falls back to the emoji the achievement has always carried if no artwork
 * exists for it, so adding an achievement without art degrades to what it used
 * to look like rather than to a hole in the row.
 */
import { Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ACHIEVEMENT_ICONS } from '../lib/achievement-icons';

export function AchievementIcon({
  id,
  size,
  emoji,
  label,
}: {
  id: string;
  /** Height and width in points. The artwork is square. */
  size: number;
  /** Shown if this achievement has no artwork yet. */
  emoji?: string;
  label?: string;
}) {
  const icon = ACHIEVEMENT_ICONS[id];
  if (!icon) {
    return emoji ? <Text style={{ fontSize: size * 0.9 }}>{emoji}</Text> : null;
  }
  return (
    <Svg width={size} height={size} viewBox={icon.viewBox} accessibilityLabel={label}>
      {icon.parts.map((p, i) => (
        <Path key={i} d={p.d} fill={p.fill} />
      ))}
    </Svg>
  );
}
