/**
 * TagPills — the wrapped row of #tag pills shown on cry detail views.
 * Shared by cry-detail, the feed detail sheet, My Cries and the map card
 * (previously copy-pasted in all four).
 */
import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';

export function TagPills({ tags, style }: { tags?: string[] | null; style?: StyleProp<ViewStyle> }) {
  if (!tags || tags.length === 0) return null;
  return (
    <View style={[s.row, style]}>
      {tags.map(t => (
        <Text key={t} style={s.pill}>#{t}</Text>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    color: '#94a3b8', fontSize: 12, fontWeight: '500',
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    overflow: 'hidden',
  },
});
