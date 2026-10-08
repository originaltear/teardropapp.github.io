/**
 * Avatar — shared user avatar with a teardrop fallback.
 *
 * Replaces the half-dozen near-identical local Avatar definitions across the app.
 * `fallbackColor` lets callers tint the placeholder (e.g. the map/profile use the
 * theme accent; lists use the muted surface colour).
 */
import { memo } from 'react';
import { View, Image, Text } from 'react-native';
import { Tear } from './EmotionIcon';

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
      {/* No picture yet: the app's own drop rather than the water emoji, so a
          default avatar still belongs to this app. */}
      {/* On the muted surface the drop is the accent; on a coloured
          placeholder it is cut out in the background ink instead, or a cyan
          drop on a cyan circle simply disappears. */}
      <Tear size={size * 0.5} filled color={fallbackColor === '#1f2937' ? '#6fe0e6' : '#0d1117'} />
    </View>
  );
});
