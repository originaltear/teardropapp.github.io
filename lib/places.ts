/**
 * Place-based insight — the one thing no other journal can do.
 *
 * Daylio, Stoic and How We Feel all know what you felt and when. None of them
 * knows where. Teardrop has had the coordinates since day one and has never
 * used them for anything except drawing a pin.
 *
 * Everything here is computed from latitude and longitude already on the cry.
 * No new permission, no new network call at log time, and it works offline.
 * Only the naming of a place asks the geocoder, once per place, cached.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import type { Cry } from './storage';

/** Two cries within this distance are treated as the same place. */
const PLACE_RADIUS_M = 500;

/** Beyond this from your usual place counts as "away". */
const AWAY_RADIUS_M = 25_000;

const NAME_CACHE_KEY = 'teardrop_place_names';

export interface Place {
  latitude: number;
  longitude: number;
  count: number;
  /** Emotion id that appears most here. */
  dominant: string;
  avgIntensity: number;
  /** Resolved lazily; undefined until named. */
  name?: string;
}

export interface PlaceInsight {
  places: Place[];
  /** The place with the most cries, if there is one. */
  home: Place | null;
  /** Cries logged more than AWAY_RADIUS_M from home. */
  awayCount: number;
  /** Average intensity at home vs away, null when there isn't enough to say. */
  homeIntensity: number | null;
  awayIntensity: number | null;
  /** Most common emotion at home and away, when they differ it's worth saying. */
  homeEmotion: string | null;
  awayEmotion: string | null;
}

/** Metres between two coordinates. Haversine — good enough at these scales. */
function distance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function mode(values: string[]): string | null {
  if (!values.length) return null;
  const tally: Record<string, number> = {};
  for (const v of values) tally[v] = (tally[v] ?? 0) + 1;
  return Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Groups cries into places by proximity.
 *
 * Greedy single-pass rather than proper k-means: with the number of cries one
 * person logs in a year, the difference is invisible and this needs no
 * iteration count, no random seed and no dependency.
 */
export function computePlaces(cries: Cry[]): PlaceInsight {
  const located = cries.filter(c => c.latitude != null && c.longitude != null);

  const buckets: { lat: number; lng: number; items: Cry[] }[] = [];
  for (const c of located) {
    const hit = buckets.find(b => distance(b.lat, b.lng, c.latitude, c.longitude) <= PLACE_RADIUS_M);
    if (hit) {
      hit.items.push(c);
      // Drift the centre toward the new point so a bucket tracks its members
      // instead of staying pinned to whichever cry happened to be first.
      hit.lat += (c.latitude - hit.lat) / hit.items.length;
      hit.lng += (c.longitude - hit.lng) / hit.items.length;
    } else {
      buckets.push({ lat: c.latitude, lng: c.longitude, items: [c] });
    }
  }

  const places: Place[] = buckets
    .map(b => ({
      latitude: b.lat,
      longitude: b.lng,
      count: b.items.length,
      dominant: mode(b.items.map(i => i.emotion)) ?? 'mixed',
      avgIntensity: mean(b.items.map(i => i.intensity)) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const home = places[0] ?? null;

  const homeCries = home
    ? located.filter(c => distance(home.latitude, home.longitude, c.latitude, c.longitude) <= AWAY_RADIUS_M)
    : [];
  const awayCries = home
    ? located.filter(c => distance(home.latitude, home.longitude, c.latitude, c.longitude) > AWAY_RADIUS_M)
    : [];

  return {
    places,
    home,
    awayCount: awayCries.length,
    homeIntensity: mean(homeCries.map(c => c.intensity)),
    awayIntensity: mean(awayCries.map(c => c.intensity)),
    homeEmotion: mode(homeCries.map(c => c.emotion)),
    awayEmotion: mode(awayCries.map(c => c.emotion)),
  };
}

/**
 * Puts a human name on a place.
 *
 * Cached by rounded coordinates, so a place is looked up once ever rather than
 * on every visit to the stats screen. Failure is silent: an unnamed place still
 * has its count and its colour, which is most of the value.
 */
export async function namePlaces(places: Place[], limit = 5): Promise<Place[]> {
  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse((await AsyncStorage.getItem(NAME_CACHE_KEY)) ?? '{}');
  } catch { /* a broken cache is just an empty cache */ }

  let dirty = false;
  const out = [...places];

  for (let i = 0; i < Math.min(limit, out.length); i++) {
    const p = out[i];
    const key = `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
    if (cache[key]) { out[i] = { ...p, name: cache[key] }; continue; }

    try {
      const geo = await Promise.race([
        Location.reverseGeocodeAsync({ latitude: p.latitude, longitude: p.longitude }),
        new Promise<null>(res => setTimeout(() => res(null), 3000)),
      ]);
      const g = geo?.[0];
      // District beats city beats region: "Vesterbro" says more than "Denmark".
      const name = g?.district ?? g?.subregion ?? g?.city ?? g?.region ?? undefined;
      if (name) {
        cache[key] = name;
        dirty = true;
        out[i] = { ...p, name };
      }
    } catch { /* unnamed is fine */ }
  }

  if (dirty) {
    try { await AsyncStorage.setItem(NAME_CACHE_KEY, JSON.stringify(cache)); } catch { /* best effort */ }
  }
  return out;
}
