/**
 * Tears emblem display.
 * Shows selected tear emojis next to @username.
 * Tapping a tear shows how it was obtained.
 */
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { getTearInfo } from '../lib/achievements';

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
      {tears.slice(0, 3).map((tear, i) => (
        <TouchableOpacity
          key={`${tear}-${i}`}
          onPress={() => handlePress(tear)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={s.tear}>{tear}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tear: { fontSize: 14 },
});
