/**
 * Tears emblem display — the badges shown beside @username.
 *
 * Emblems are stored in the database as emoji strings, which stay the key.
 * What gets drawn is the glyph named on each TearDef, in that tear's own
 * colour, because these are things you earned rather than controls: a row of
 * identical grey strokes would read as a toolbar.
 *
 * They sit at 15pt beside a name, which is why they are plain outline glyphs
 * and not the teardrop artwork — a motif inside a drop is unreadable that small.
 */
import { View, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { getTearInfo } from '../lib/achievements';
import { UiIcon } from './UiIcon';

interface Props {
  tears: string[] | null | undefined;
}

export function TearsBadge({ tears }: Props) {
  if (!tears || tears.length === 0) return null;

  function handlePress(tear: string) {
    const info = getTearInfo(tear);
    if (info) {
      Alert.alert(info.name, info.howObtained);
    }
  }

  return (
    <View style={s.row}>
      {tears.slice(0, 3).map((tear, i) => {
        const info = getTearInfo(tear);
        return (
          <TouchableOpacity
            key={`${tear}-${i}`}
            onPress={() => handlePress(tear)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={info?.name ?? 'Tear'}
          >
            <UiIcon
              name={info?.icon ?? 'droplets'}
              size={16}
              color={info?.color ?? '#6fe0e6'}
              strokeWidth={2.2}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
