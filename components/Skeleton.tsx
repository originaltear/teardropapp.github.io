/**
 * Skeleton — a softly pulsing placeholder block, and ListSkeleton, a column of
 * avatar + text-line placeholders used while feeds/lists load (nicer than a
 * lone spinner).
 */
import { useEffect, useRef } from 'react';
import { Animated, View, StyleProp, ViewStyle } from 'react-native';

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[{ backgroundColor: '#1a2230', borderRadius: 8, opacity: pulse }, style]} />;
}

export function ListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <View style={{ paddingTop: 8 }} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' }}
        >
          <Skeleton style={{ width: 44, height: 44, borderRadius: 22 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ width: '55%', height: 12, borderRadius: 6 }} />
            <Skeleton style={{ width: '80%', height: 10, borderRadius: 5 }} />
            <Skeleton style={{ width: '35%', height: 10, borderRadius: 5 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
