/**
 * UiIcon — the app's interface glyphs: tabs, the profile header, the map filter.
 *
 * Deliberately not the emotion artwork. These sit at 20 to 24pt, where a
 * teardrop's motif disappears, and they name places and actions rather than
 * feelings. See ../lib/ui-icons.
 */
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { UI_ICONS, UI_VIEWBOX } from '../lib/ui-icons';

export function UiIcon({
  name,
  size = 22,
  color,
  /** Lucide draws at 2 units on a 24 grid; thinner reads lighter when inactive. */
  strokeWidth = 2,
  filled = false,
}: {
  name: keyof typeof UI_ICONS | string;
  size?: number;
  color: string;
  strokeWidth?: number;
  /** Fills the glyph in its own colour — for a chosen star, not for line icons. */
  filled?: boolean;
}) {
  const shapes = UI_ICONS[name];
  if (!shapes) return null;

  return (
    <Svg width={size} height={size} viewBox={UI_VIEWBOX}>
      {shapes.map((s, i) => {
        const stroke = {
          stroke: color,
          strokeWidth,
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
          fill: filled ? color : 'none',
        };
        if ('d' in s) return <Path key={i} d={s.d} {...stroke} />;
        if ('c' in s) return <Circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} {...stroke} />;
        if ('l' in s) return <Line key={i} x1={s.l[0]} y1={s.l[1]} x2={s.l[2]} y2={s.l[3]} {...stroke} />;
        return (
          <Rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4]} {...stroke} />
        );
      })}
    </Svg>
  );
}
