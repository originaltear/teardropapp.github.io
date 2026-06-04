/**
 * Map markers — bulletproof on Android.
 *
 * The classic react-native-maps Android bug is that custom marker views drawn
 * with `borderRadius` get rasterised as CLIPPED SQUARES instead of circles
 * (the rounded background + elevation is captured as a rectangle, and the
 * bitmap is often grabbed before layout settles).
 *
 * The fix here: the marker's container View is fully transparent and has NO
 * borderRadius and NO background — there is literally nothing that can be
 * clipped into a square. The visible shape (teardrop pin / cluster circle) is
 * drawn entirely as a vector with react-native-svg, which rasterises
 * identically on iOS and Android.
 *
 * We also flip `tracksViewChanges` to false shortly after mount so Android
 * rasterises each marker once (crisp) and then stops re-capturing the bitmap —
 * this both fixes flicker and keeps the map smooth with many markers.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Path, Circle, Ellipse } from 'react-native-svg';
import { emotionById } from '../lib/emotions';

// ─── tracksViewChanges: true until first paint, then false ────────────────────

function useTracksOnce(delay = 700): boolean {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setTracks(false), delay);
    return () => clearTimeout(id);
  }, []);
  return tracks;
}

// ─── Individual emotion pin (teardrop shape) ──────────────────────────────────

const PIN_W = 40;
const PIN_H = 50;
// Teardrop: round bulb (centre 20,18 r16) tapering to a point at the bottom tip.
const PIN_PATH = 'M20 49 C11 37 4 29 4 18 A16 16 0 1 1 36 18 C36 29 29 37 20 49 Z';

export function EmotionPin({
  latitude, longitude, emotion, onPress,
}: {
  latitude: number;
  longitude: number;
  emotion: string;
  onPress: () => void;
}) {
  const e = emotionById(emotion);
  const color = e?.color ?? '#6fe0e6';
  const tracks = useTracksOnce();

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 1 }}
      onPress={onPress}
      tracksViewChanges={tracks}
    >
      <View style={[styles.transparentWrap, { width: PIN_W, height: PIN_H }]}>
        <Svg width={PIN_W} height={PIN_H} viewBox="0 0 40 50">
          {/* ground shadow */}
          <Ellipse cx={20} cy={48} rx={5.5} ry={1.8} fill="rgba(0,0,0,0.28)" />
          {/* pin body */}
          <Path d={PIN_PATH} fill={color} stroke="#0d1117" strokeWidth={1.5} strokeLinejoin="round" />
          {/* glossy highlight */}
          <Circle cx={15} cy={12} r={3.5} fill="#ffffff" opacity={0.18} />
          {/* dark inner disc for emoji contrast */}
          <Circle cx={20} cy={18} r={11} fill="#0d1117" opacity={0.92} />
          <Circle cx={20} cy={18} r={11} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
        </Svg>
        {/* emoji overlay, centred on the bulb (y≈18 of 50) */}
        <View style={styles.emojiBox} pointerEvents="none">
          <Text style={styles.pinEmoji}>{e?.emoji ?? '💧'}</Text>
        </View>
      </View>
    </Marker>
  );
}

// ─── Cluster bubble ───────────────────────────────────────────────────────────

function dominantColor(counts?: Record<string, number>): string {
  if (!counts) return '#6fe0e6';
  let best: string | null = null;
  let bestN = -1;
  for (const k in counts) {
    if (counts[k] > bestN) { best = k; bestN = counts[k]; }
  }
  return emotionById(best ?? '')?.color ?? '#6fe0e6';
}

function clusterSize(count: number): number {
  if (count < 10) return 40;
  if (count < 50) return 50;
  if (count < 200) return 60;
  return 70;
}

export function ClusterPin({
  latitude, longitude, count, emotionCounts, onPress,
}: {
  latitude: number;
  longitude: number;
  count: number;
  emotionCounts?: Record<string, number>;
  onPress: () => void;
}) {
  const color = dominantColor(emotionCounts);
  const size = clusterSize(count);
  // No transparent halo: semi-transparent areas in a marker view rasterise as a
  // muddy grey square on Android. Everything here is fully opaque.
  const box = size + 6; // just a little breathing room around the disc
  const c = box / 2;
  const r = size / 2;
  const tracks = useTracksOnce();
  const label = count > 999 ? `${Math.floor(count / 1000)}k` : String(count);

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={onPress}
      tracksViewChanges={tracks}
    >
      <View style={[styles.transparentWrap, { width: box, height: box }]}>
        <Svg width={box} height={box}>
          {/* dark backing ring — crisp outline against the map (opaque) */}
          <Circle cx={c} cy={c} r={r} fill="#0d1117" />
          {/* main coloured disc (opaque) */}
          <Circle cx={c} cy={c} r={r - 2.5} fill={color} />
          {/* glossy top highlight (small, over an opaque disc — safe) */}
          <Circle cx={c} cy={c - r * 0.32} r={r * 0.42} fill="#ffffff" opacity={0.16} />
          {/* thin inner rim for depth (solid dark stroke) */}
          <Circle cx={c} cy={c} r={r - 5} fill="none" stroke="#0d1117" strokeWidth={1.5} />
        </Svg>
        <View style={styles.clusterLabelBox} pointerEvents="none">
          <Text style={[styles.clusterCount, { fontSize: size * 0.36 }]}>{label}</Text>
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  // No background, no borderRadius — nothing Android can clip into a square.
  transparentWrap: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBox: {
    position: 'absolute',
    top: 2,
    left: 0,
    right: 0,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinEmoji: { fontSize: 15, textAlign: 'center' },
  // Full-box centring so the count sits exactly in the middle of the disc.
  clusterLabelBox: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCount: {
    color: '#0d1117',
    fontWeight: '800',
    textAlign: 'center',
  },
});
