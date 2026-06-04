/**
 * Map markers — bulletproof on Android.
 *
 * Two Android pitfalls are handled here:
 *
 * 1. Clipped-square markers. Custom marker views drawn with `borderRadius` get
 *    rasterised as squares. We avoid that entirely: the container View is fully
 *    transparent with NO borderRadius / background, and the visible shape is
 *    drawn as react-native-svg vectors.
 *
 * 2. Content clipped at the view edge. react-native-maps rasterises the marker
 *    to a bitmap the size of the view; anything touching the edge (e.g. the
 *    teardrop tip at the very bottom) gets cut off. So every shape is drawn with
 *    a generous transparent margin and never reaches the view bounds. The pin's
 *    anchor is offset to match the tip's padded position so it still points at
 *    the exact coordinate.
 *
 * `tracksViewChanges` flips to false shortly after mount so each marker is
 * rasterised once (crisp) and then left static.
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Path, Circle, Ellipse } from 'react-native-svg';
import { emotionById } from '../lib/emotions';

// ─── tracksViewChanges: true until first paint, then false ────────────────────

function useTracksOnce(delay = 900): boolean {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setTracks(false), delay);
    return () => clearTimeout(id);
  }, []);
  return tracks;
}

// ─── Individual emotion pin (teardrop shape) ──────────────────────────────────

// viewBox 42×56 with the teardrop padded well inside every edge.
// Bulb centre (21,21) r16; tip at (21,52). 4–5px clear margin all round.
const PIN_W = 42;
const PIN_H = 56;
const PIN_PATH = 'M21 52 C12 40 5 32 5 21 A16 16 0 1 1 37 21 C37 32 30 40 21 52 Z';
// Tip sits at y=52 of 56 → anchor y so the tip points at the exact coordinate.
const PIN_ANCHOR = { x: 0.5, y: 52 / PIN_H };

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
      anchor={PIN_ANCHOR}
      onPress={onPress}
      tracksViewChanges={tracks}
      zIndex={5}
    >
      <View style={{ width: PIN_W, height: PIN_H }}>
        <Svg width={PIN_W} height={PIN_H} viewBox="0 0 42 56">
          {/* ground shadow */}
          <Ellipse cx={21} cy={51} rx={5.5} ry={1.8} fill="rgba(0,0,0,0.28)" />
          {/* pin body */}
          <Path d={PIN_PATH} fill={color} stroke="#0d1117" strokeWidth={1.5} strokeLinejoin="round" />
          {/* glossy highlight */}
          <Circle cx={16} cy={15} r={3.5} fill="#ffffff" opacity={0.18} />
          {/* dark inner disc for emoji contrast */}
          <Circle cx={21} cy={21} r={11} fill="#0d1117" opacity={0.92} />
          <Circle cx={21} cy={21} r={11} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
        </Svg>
        {/* emoji overlay, centred on the bulb (y≈21 of 56) */}
        <View style={[styles.overlayBox, { top: 5, height: 32 }]} pointerEvents="none">
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
  const box = size + 16; // generous transparent margin so nothing clips
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
      zIndex={6}
    >
      <View style={{ width: box, height: box }}>
        <Svg width={box} height={box}>
          {/* dark backing ring — crisp outline against the map (opaque) */}
          <Circle cx={c} cy={c} r={r} fill="#0d1117" />
          {/* main coloured disc (opaque) */}
          <Circle cx={c} cy={c} r={r - 2.5} fill={color} />
          {/* glossy top highlight (small, over the opaque disc — safe) */}
          <Circle cx={c} cy={c - r * 0.32} r={r * 0.42} fill="#ffffff" opacity={0.16} />
          {/* thin inner rim for depth (solid dark stroke) */}
          <Circle cx={c} cy={c} r={r - 5} fill="none" stroke="#0d1117" strokeWidth={1.5} />
        </Svg>
        <View style={[styles.overlayBox, styles.fillBox]} pointerEvents="none">
          <Text style={[styles.clusterCount, { fontSize: size * 0.36 }]}>{label}</Text>
        </View>
      </View>
    </Marker>
  );
}

// ─── "You are here" dot (custom, lightweight — no big accuracy circle) ────────

export function LocationDot({
  latitude, longitude, color = '#6fe0e6',
}: {
  latitude: number;
  longitude: number;
  color?: string;
}) {
  const tracks = useTracksOnce();
  const S = 26;
  const c = S / 2;
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      zIndex={1}            // sits under cry pins / clusters
    >
      <View style={{ width: S, height: S }}>
        <Svg width={S} height={S}>
          {/* dark halo ring + white ring + coloured core — all opaque */}
          <Circle cx={c} cy={c} r={9} fill="#0d1117" />
          <Circle cx={c} cy={c} r={7.5} fill="#ffffff" />
          <Circle cx={c} cy={c} r={5} fill={color} />
        </Svg>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  overlayBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fillBox: { top: 0, bottom: 0 },
  pinEmoji: { fontSize: 15, textAlign: 'center' },
  clusterCount: {
    color: '#0d1117',
    fontWeight: '800',
    textAlign: 'center',
  },
});
