/**
 * WrappedConfetti — the finale burst on the last recap card.
 *
 * Deliberately not generic confetti and deliberately not Lottie: these are
 * teardrops, falling in the colours of the emotions the user actually logged
 * this year. It's on-brand, it costs no new dependency, and every particle is
 * driven entirely by transform + opacity, so the whole burst runs on the
 * native thread.
 */
import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, useWindowDimensions } from 'react-native';

const PARTICLE_COUNT = 26;

interface ParticleSpec {
  key: string;
  color: string;
  size: number;
  startX: number;
  drift: number;
  spin: number;
  delay: number;
  duration: number;
}

function Particle({ spec, height, run }: { spec: ParticleSpec; height: number; run: boolean }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!run) { t.setValue(0); return; }
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: spec.duration,
      delay: spec.delay,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [run, t, spec.duration, spec.delay]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-50, height + 70] });
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, spec.drift] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spec.spin}deg`] });
  // Fade in fast, hold, fade out before it lands.
  const opacity = t.interpolate({
    inputRange: [0, 0.08, 0.7, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        { left: spec.startX, opacity, transform: [{ translateY }, { translateX }, { rotate }] },
      ]}
    >
      {/* Teardrop: a circle with one square corner, tipped 45° */}
      <View
        style={{
          width: spec.size,
          height: spec.size,
          backgroundColor: spec.color,
          borderTopLeftRadius: spec.size / 2,
          borderTopRightRadius: spec.size / 2,
          borderBottomRightRadius: spec.size / 2,
          borderBottomLeftRadius: 0,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </Animated.View>
  );
}

export function WrappedConfetti({ colors, run }: { colors: string[]; run: boolean }) {
  const { width, height } = useWindowDimensions();

  // Fixed per mount so the burst doesn't reshuffle on every render.
  const specs = useMemo<ParticleSpec[]>(() => {
    const palette = colors.length > 0 ? colors : ['#6fe0e6'];
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      key: `p${i}`,
      color: palette[i % palette.length],
      size: 7 + Math.random() * 8,
      startX: Math.random() * width,
      drift: (Math.random() - 0.5) * 90,
      spin: 180 + Math.random() * 540,
      delay: Math.random() * 900,
      duration: 2600 + Math.random() * 1800,
    }));
  }, [colors, width]);

  return (
    <View style={styles.layer} pointerEvents="none">
      {specs.map(spec => (
        <Particle key={spec.key} spec={spec} height={height} run={run} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  particle: { position: 'absolute', top: 0 },
});
