/**
 * WrappedCard — the shell every "Your Year in Tears" slide sits in.
 *
 * Handles the shared chrome (emotion-tinted glow, spacing) and the staggered
 * entrance: eyebrow, then hero, then caption. Content animates in only when the
 * card becomes the active page, so swiping back and forth replays it rather
 * than showing everything pre-revealed.
 *
 * Uses the built-in Animated API (native driver) rather than Reanimated — these
 * are simple opacity/translate tweens and this keeps the screen dependency-free.
 */
import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

const BG = '#070a14';

function useStagger(active: boolean, steps: number) {
  const values = useRef(
    Array.from({ length: steps }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (!active) {
      values.forEach(v => v.setValue(0));
      return;
    }
    const animations = values.map((v, i) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 420,
        delay: 120 + i * 160,
        useNativeDriver: true,
      }),
    );
    Animated.parallel(animations).start();
  }, [active, values]);

  return values;
}

export interface WrappedCardProps {
  active: boolean;
  accent: string;
  eyebrow: string;
  /** The big visual payload — number, chart, list. */
  children: React.ReactNode;
  /** The witty one-liner under the hero. */
  caption?: string;
}

export function WrappedCard({ active, accent, eyebrow, children, caption }: WrappedCardProps) {
  const { width, height } = useWindowDimensions();
  const [aEyebrow, aHero, aCaption] = useStagger(active, 3);

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{
      translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
    }],
  });

  return (
    <View style={[styles.page, { width }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id={`g-${eyebrow}`} cx="50%" cy="30%" r="80%">
            <Stop offset="0" stopColor={accent} stopOpacity="0.22" />
            <Stop offset="0.6" stopColor={accent} stopOpacity="0.05" />
            <Stop offset="1" stopColor={BG} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={BG} />
        <Rect x="0" y="0" width={width} height={height} fill={`url(#g-${eyebrow})`} />
      </Svg>

      <View style={styles.content}>
        <Animated.Text style={[styles.eyebrow, rise(aEyebrow)]}>
          {eyebrow}
        </Animated.Text>

        <Animated.View style={[styles.hero, rise(aHero)]}>
          {children}
        </Animated.View>

        {caption ? (
          <Animated.Text style={[styles.caption, rise(aCaption)]}>
            {caption}
          </Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 80, gap: 20 },
  eyebrow: {
    color: '#8fa3b0', fontSize: 12, letterSpacing: 3,
    fontFamily: 'monospace', textTransform: 'uppercase',
  },
  hero: { gap: 10 },
  caption: { color: '#c6d4dd', fontSize: 17, lineHeight: 25 },
});
