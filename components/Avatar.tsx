/**
 * Avatar — shared user avatar with a teardrop fallback.
 *
 * Replaces the half-dozen near-identical local Avatar definitions across the app.
 * `fallbackColor` lets callers tint the placeholder (e.g. the map/profile use the
 * theme accent; lists use the muted surface colour).
 */
import { memo } from 'react';
import { View, Image, Text } from 'react-native';

export const Avatar = memo(function Avatar({
  uri, size = 36, fallbackColor = '#1f2937',
}: {
  uri?: string | null;
  size?: number;
  fallbackColor?: string;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1f2937' }}
        fadeDuration={150}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: fallbackColor, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.45 }}>💧</Text>
    </View>
  );
});
