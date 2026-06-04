/**
 * Map markers.
 *
 * Rendered as react-native-svg vectors inside a transparent marker view. The
 * app runs on the OLD React Native architecture (newArchEnabled=false) because
 * react-native-maps custom markers render broken (clipped squares / default
 * Google pins) under the New Architecture on Expo SDK 54.
 *
 * Design:
 *  - Individual pin: dark teardrop body with an emotion-coloured outline + emoji.
 *  - Cluster: dark circle with the count and a Tear Blue (#6fe0e6) outline.
 *
 * Shapes are padded well inside the view bounds so nothing is clipped, and
 * tracksViewChanges flips to false after first paint so each marker is
 * rasterised once and then left static.
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Path, Circle, Ellipse } from 'react-native-svg';
import { emotionById } from '../lib/emotions';

const DARK = '#0d1117';
const TEAR_BLUE = '#6fe0e6';

// ─── tracksViewChanges: true until first paint, then false ────────────────────

function useTracksOnce(delay = 900): boolean {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setTracks(false), delay);
    return () => clearTimeout(id);
  }, []);
  return tracks;
}

// ─── Individual emotion pin (dark teardrop + coloured outline) ────────────────

const PIN_W = 42;
const PIN_H = 56;
// Teardrop padded inside the 42×56 box: bulb centre (21,21) r16, tip at (21,52).
const PIN_PATH = 'M21 52 C12 40 5 32 5 21 A16 16 0 1 1 37 21 C37 32 30 40 21 52 Z';
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
  const color = e?.color ?? TEAR_BLUE;
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
          <Ellipse cx={21} cy={51} rx={5.5} ry={1.8} fill="rgba(0,0,0,0.3)" />
          {/* dark body + emotion-coloured outline */}
          <Path d={PIN_PATH} fill={DARK} stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        </Svg>
        {/* emoji overlay, centred on the bulb (y≈21 of 56) */}
        <View style={[styles.overlayBox, { top: 5, height: 32 }]} pointerEvents="none">
          <Text style={styles.pinEmoji}>{e?.emoji ?? '💧'}</Text>
        </View>
      </View>
    </Marker>
  );
}

// ─── Cluster bubble (dark circle + count + Tear Blue outline) ──────────────────

function clusterSize(count: number): number {
  if (count < 10) return 42;
  if (count < 50) return 50;
  if (count < 200) return 60;
  return 70;
}

export function ClusterPin({
  latitude, longitude, count, onPress,
}: {
  latitude: number;
  longitude: number;
  count: number;
  onPress: () => void;
}) {
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
          {/* dark circle + Tear Blue outline */}
          <Circle cx={c} cy={c} r={r} fill={DARK} stroke={TEAR_BLUE} strokeWidth={2.5} />
        </Svg>
        <View style={[styles.overlayBox, styles.fillBox]} pointerEvents="none">
          <Text style={[styles.clusterCount, { fontSize: size * 0.38 }]}>{label}</Text>
        </View>
      </View>
    </Marker>
  );
}

// ─── "You are here" dot (custom, lightweight — no big accuracy circle) ────────

export function LocationDot({
  latitude, longitude, color = TEAR_BLUE,
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
          <Circle cx={c} cy={c} r={9} fill={DARK} />
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
    color: TEAR_BLUE,
    fontWeight: '800',
    textAlign: 'center',
  },
});
