/**
 * Map markers.
 *
 * Rendered as react-native-svg vectors inside a transparent marker view.
 *
 * ⚠️ New Architecture note (SDK 56+): custom view markers have a history of
 * rendering broken on Fabric (react-native-maps#5877 — invisible/clipped
 * children). Two mitigations are applied here and MUST be device-tested after
 * any react-native-maps upgrade:
 *  - `collapsable={false}` on the child wrapper so Fabric's view flattening
 *    can never optimise the marker content away.
 *  - tracksViewChanges flips to false after first paint so each marker is
 *    rasterised once and then left static (also avoids the Fabric flicker).
 *
 * Design:
 *  - Individual pin: dark teardrop body with an emotion-coloured outline + emoji.
 *  - Cluster: dark circle with the count and a Tear Blue (#6fe0e6) outline.
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Path, Circle, Ellipse } from 'react-native-svg';
import { emotionById } from '../lib/emotions';

const DARK = '#0d1117';
const TEAR_BLUE = '#6fe0e6';
/** Everything outside a cluster's three most common emotions. */
const REST_GREY = '#334155';

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
      <View style={{ width: PIN_W, height: PIN_H }} collapsable={false}>
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
  latitude, longitude, count, tally, onPress,
}: {
  latitude: number;
  longitude: number;
  count: number;
  /** How many of each emotion are inside, accumulated by supercluster. */
  tally?: Record<string, number>;
  onPress: () => void;
}) {
  const size = clusterSize(count);
  const box = size + 16; // generous transparent margin so nothing clips
  const c = box / 2;
  const r = size / 2;
  const tracks = useTracksOnce();
  const label = count > 999 ? `${Math.floor(count / 1000)}k` : String(count);

  // The ring is split into arcs for the three most common emotions inside,
  // sized by their share of the whole cluster rather than of each other — a
  // group whose top three account for half of it should look half-described,
  // not fully explained. Whatever is left over is drawn in a muted grey so the
  // remainder is visible as remainder.
  //
  // A single solid ring said only what the group mostly was. Three arcs say
  // whether a place is one feeling or an argument between several, which is the
  // thing worth knowing before deciding to tap.
  const ranked = tally
    ? Object.entries(tally).sort((a, b) => b[1] - a[1])
    : [];
  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  const top = ranked.slice(0, 3);
  const dominant = top[0]?.[0];
  const ringColor = (dominant && emotionById(dominant)?.color) || TEAR_BLUE;

  // Circumference of the stroked circle, which is what the dash lengths are
  // measured against.
  const circumference = 2 * Math.PI * r;
  // A hairline gap keeps two adjacent arcs from reading as one longer arc.
  const GAP = 3;

  const segments: { color: string; length: number; offset: number }[] = [];
  if (total > 0) {
    let cursor = 0;
    for (const [id, n] of top) {
      const length = (n / total) * circumference;
      segments.push({
        color: emotionById(id)?.color || TEAR_BLUE,
        length,
        offset: cursor,
      });
      cursor += length;
    }
    const rest = circumference - cursor;
    // Only worth drawing when there is a meaningful amount left; a sliver of
    // grey between arcs would just look like a rendering fault.
    if (rest > GAP * 2) segments.push({ color: REST_GREY, length: rest, offset: cursor });
  }

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={onPress}
      tracksViewChanges={tracks}
      zIndex={6}
    >
      <View style={{ width: box, height: box }} collapsable={false}>
        <Svg width={box} height={box}>
          {/* A faint halo in the same colour, so a cluster reads as a place
              where more happened rather than as a flat badge. */}
          <Circle cx={c} cy={c} r={r + 5} fill={ringColor} opacity={0.22} />
          {/* The disc itself. The ring is drawn over it as separate arcs. */}
          <Circle cx={c} cy={c} r={r} fill={DARK} />
          {segments.length > 0 ? (
            segments.map((seg, i) => (
              <Circle
                key={i}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={2.5}
                strokeLinecap="butt"
                // Draw `length` then skip the rest of the way round, and start
                // the dash where the previous arc ended. The rotation moves the
                // first arc to twelve o'clock, which is where an eye starts.
                strokeDasharray={`${Math.max(seg.length - GAP, 0.5)} ${circumference}`}
                strokeDashoffset={-seg.offset}
                transform={`rotate(-90 ${c} ${c})`}
              />
            ))
          ) : (
            // No tally at all: older data, or a cluster of one. A plain ring.
            <Circle cx={c} cy={c} r={r} fill="none" stroke={ringColor} strokeWidth={2.5} />
          )}
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
      <View style={{ width: S, height: S }} collapsable={false}>
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
    // The ring carries the emotion's colour now, so the number stays neutral.
    // Leaving it blue meant a pink ring around a blue number, which reads as
    // an accident rather than a choice.
    color: '#e2e8f0',
    fontWeight: '800',
    textAlign: 'center',
  },
});
