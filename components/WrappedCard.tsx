/**
 * WrappedCard — the shell every "Your Year in Tears" slide sits in.
 *
 * Three things make this feel like a story rather than a scrollable report:
 *
 *  1. Living background. Two soft colour blobs drift slowly behind the content,
 *     translated on the native thread so they never stutter.
 *  2. Layout variants. Cards deliberately break formation — `flood` washes the
 *     whole screen in the emotion's colour, `center` stacks big type in the
 *     middle, `default` is the quieter left-aligned reading layout. Uniform
 *     cards are what make a recap feel like a spreadsheet.
 *  3. Staggered entrance, replayed every time the card becomes active.
 *
 * Motion uses the built-in Animated API: opacity/transform only, native driver
 * throughout, no extra dependency.
 */
import { useEffect, useId, useRef } from 'react';
import { View, Text, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Rect } from 'react-native-svg';

const BG = '#070a14';

export type WrappedVariant = 'default' | 'center' | 'flood';

// ─── Living background ────────────────────────────────────────────────────────

function DriftBlob({ color, size, opacity, path, duration, delay }: {
  color: string;
  size: number;
  opacity: number;
  path: { x: [number, number]; y: [number, number] };
  duration: number;
  delay: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  const gid = `blob-${useId()}`;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration, delay, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, duration, delay]);

  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: path.x });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: path.y });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.blob, { transform: [{ translateX }, { translateY }] }]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.7" stopColor={color} stopOpacity={opacity * 0.25} />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
}

// ─── Entrance ─────────────────────────────────────────────────────────────────

function useStagger(active: boolean, steps: number) {
  const values = useRef(
    Array.from({ length: steps }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (!active) {
      values.forEach(v => v.setValue(0));
      return;
    }
    Animated.parallel(
      values.map((v, i) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 460,
          delay: 120 + i * 150,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [active, values]);

  return values;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export interface WrappedCardProps {
  active: boolean;
  accent: string;
  eyebrow: string;
  children: React.ReactNode;
  caption?: string;
  variant?: WrappedVariant;
}

export function WrappedCard({
  active, accent, eyebrow, children, caption, variant = 'default',
}: WrappedCardProps) {
  const { width, height } = useWindowDimensions();
  const [aEyebrow, aHero, aCaption] = useStagger(active, 3);
  const gid = `wash-${useId()}`;

  const rise = (v: Animated.Value, distance = 20) => ({
    opacity: v,
    transform: [{
      translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }),
    }],
  });

  const flood = variant === 'flood';
  const centered = variant === 'center' || flood;

  return (
    <View style={[styles.page, { width }]}>
      {/* Base wash — stronger on flood cards so they read as a different world */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id={gid} cx="50%" cy={flood ? '50%' : '28%'} r={flood ? '85%' : '80%'}>
            <Stop offset="0" stopColor={accent} stopOpacity={flood ? '0.42' : '0.20'} />
            <Stop offset="0.6" stopColor={accent} stopOpacity={flood ? '0.12' : '0.05'} />
            <Stop offset="1" stopColor={BG} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={BG} />
        <Rect x="0" y="0" width={width} height={height} fill={`url(#${gid})`} />
      </Svg>

      {/* Two slow-drifting blobs give the background a pulse */}
      <DriftBlob
        color={accent} size={width * 1.1} opacity={flood ? 0.3 : 0.18}
        path={{ x: [-width * 0.25, width * 0.15], y: [height * 0.05, height * 0.22] }}
        duration={14000} delay={0}
      />
      <DriftBlob
        color="#6fe0e6" size={width * 0.9} opacity={0.12}
        path={{ x: [width * 0.45, width * 0.05], y: [height * 0.55, height * 0.34] }}
        duration={18000} delay={1200}
      />

      <View style={[styles.content, centered && styles.contentCentered]}>
        <Animated.Text
          style={[styles.eyebrow, centered && styles.textCentered, rise(aEyebrow, 12)]}
        >
          {eyebrow}
        </Animated.Text>

        <Animated.View style={[styles.hero, centered && styles.heroCentered, rise(aHero)]}>
          {children}
        </Animated.View>

        {caption ? (
          <Animated.Text
            style={[styles.caption, centered && styles.textCentered, rise(aCaption, 26)]}
          >
            {caption}
          </Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  blob: { position: 'absolute', top: 0, left: 0 },

  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 92, gap: 20 },
  contentCentered: { alignItems: 'center', paddingHorizontal: 36 },

  eyebrow: {
    color: '#8fa3b0', fontSize: 12, letterSpacing: 3,
    fontFamily: 'monospace', textTransform: 'uppercase',
  },
  hero: { gap: 10 },
  heroCentered: { alignItems: 'center' },
  caption: { color: '#d3dfe7', fontSize: 17, lineHeight: 25 },
  textCentered: { textAlign: 'center' },
});
