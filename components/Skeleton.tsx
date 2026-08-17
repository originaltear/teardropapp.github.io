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

/**
 * Placeholder for a grid of stat cards, matching the stats screen's three rows
 * of three. A spinner tells you to wait; a shape tells you what you're waiting
 * for, and nothing jumps when the numbers arrive because they land where the
 * grey already was.
 */
export function StatsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ padding: 16, gap: 12 }} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 12 }}>
          {Array.from({ length: 3 }).map((__, c) => (
            <Skeleton key={c} style={{ flex: 1, height: 74, borderRadius: 14 }} />
          ))}
        </View>
      ))}
      {/* The chart block below the cards */}
      <Skeleton style={{ height: 18, width: '45%', borderRadius: 6, marginTop: 18 }} />
      <Skeleton style={{ height: 150, borderRadius: 14 }} />
    </View>
  );
}

/** Placeholder shaped like a single cry: who, what, how much, the note. */
export function CrySkeleton() {
  return (
    <View style={{ padding: 16, gap: 14 }} accessibilityLabel="Loading">
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Skeleton style={{ width: 38, height: 38, borderRadius: 19 }} />
        <View style={{ flex: 1, gap: 7 }}>
          <Skeleton style={{ width: '40%', height: 13, borderRadius: 6 }} />
          <Skeleton style={{ width: '28%', height: 11, borderRadius: 5 }} />
        </View>
      </View>
      <Skeleton style={{ width: 130, height: 30, borderRadius: 15 }} />
      <Skeleton style={{ width: '35%', height: 12, borderRadius: 6 }} />
      <Skeleton style={{ height: 88, borderRadius: 12 }} />
      <Skeleton style={{ width: '30%', height: 13, borderRadius: 6, marginTop: 10 }} />
    </View>
  );
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
