/**
 * Fills in the country and the country code on cries that are missing either.
 *
 * Two separate faults land here.
 *
 * The first: `reverseCountry` gives up after three seconds and returns nothing,
 * and that nothing was saved as the country with no retry and no sign anything
 * had gone wrong. A slow geocoder in the one second someone happened to log a
 * cry cost that cry its country permanently. On the test account it had cost
 * seven of eleven, so the recap counted four cries across two countries while
 * the places card, which reads coordinates, correctly counted ten.
 *
 * The second: the country was stored as a name, and the device geocoder answers
 * in the phone's language, so the same nation arrived as "Danmark" and
 * "Denmark", as "USA" and "United States". `country_code` is the fix, and the
 * rows that predate it need filling in.
 *
 * Runs on the device using the geocoder the app already uses at log time, so no
 * coordinate is handed to a service that was not already seeing it.
 */
import * as Location from 'expo-location';
import { supabase } from './supabase';
import { reverseCountry, type ReverseCountry } from './geo';
import { loadCries } from './storage';

/**
 * Ceiling per run. A user with a long history should not spend their launch
 * geocoding, and whatever is left is picked up next time.
 */
const MAX_PER_RUN = 25;

/** Platform geocoders rate-limit, and this is background work with no deadline. */
const GAP_MS = 350;

/** Country granularity, so nearby cries share one lookup. ~1km. */
const key = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

let ranThisSession = false;

/**
 * Best-effort and silent: a failure here must never reach the user, who did not
 * ask for this and cannot act on it.
 *
 * @returns how many cries were repaired.
 */
export async function backfillCountries(): Promise<number> {
  if (ranThisSession) return 0;
  ranThisSession = true;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session) return 0;               // guests have nothing to write back to

    // Location permission is not required to reverse geocode a coordinate we
    // already hold, but the module still has to be available.
    if (typeof Location.reverseGeocodeAsync !== 'function') return 0;

    const cries = await loadCries();
    const incomplete = cries.filter(
      c => c.latitude != null && c.longitude != null
        && (!c.country?.trim() || !c.countryCode?.trim()),
    ).slice(0, MAX_PER_RUN);
    if (incomplete.length === 0) return 0;

    const cache = new Map<string, ReverseCountry>();
    const resolved: { id: string; place: ReverseCountry }[] = [];

    for (const c of incomplete) {
      const k = key(c.latitude, c.longitude);
      if (!cache.has(k)) {
        cache.set(k, await reverseCountry(c.latitude, c.longitude));
        await new Promise(r => setTimeout(r, GAP_MS));
      }
      const place = cache.get(k)!;
      if (place.code || place.name) resolved.push({ id: c.id, place });
    }

    if (resolved.length === 0) return 0;

    // One statement per distinct country rather than per cry: a year of crying
    // in one place is one update, not fifty.
    const groups = new Map<string, { place: ReverseCountry; ids: string[] }>();
    for (const r of resolved) {
      const gk = `${r.place.code ?? ''}|${r.place.name ?? ''}`;
      const g = groups.get(gk) ?? { place: r.place, ids: [] };
      g.ids.push(r.id);
      groups.set(gk, g);
    }

    let written = 0;
    for (const { place, ids } of groups.values()) {
      const patch: Record<string, string> = {};
      if (place.name) patch.country = place.name;
      if (place.code) patch.country_code = place.code;

      const { error } = await supabase
        .from('cries')
        .update(patch)
        .in('id', ids)
        .eq('user_id', session.user.id);   // belt and braces; RLS enforces it too
      if (error) { console.warn('[backfillCountries]', error.message); continue; }
      written += ids.length;
    }

    return written;
  } catch (e) {
    console.warn('[backfillCountries] skipped:', e);
    return 0;
  }
}
