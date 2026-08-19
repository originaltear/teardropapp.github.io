/**
 * Fills in the country on cries that never got one.
 *
 * `reverseCountry` gives up after three seconds and returns undefined, and that
 * undefined is saved as the country with no retry and nothing to notice it. A
 * slow geocoder in the one second someone happened to log a cry costs that cry
 * its country permanently. On the test account it had cost seven of eleven, so
 * the recap counted four cries in two countries while the places card, which
 * reads coordinates, correctly counted ten. Two cards, same year, different
 * answers.
 *
 * The fix is the field, not the reader. Anything that derives its own country
 * from coordinates would be a second source of truth, which is how the
 * contradiction happened in the first place.
 *
 * Runs on the device using the geocoder the app already uses at log time, so no
 * coordinate is handed to a service that was not already seeing it.
 */
import * as Location from 'expo-location';
import { supabase } from './supabase';
import { reverseCountry } from './geo';
import { loadCries, type Cry } from './storage';

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
 * @returns how many cries were given a country.
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
    const missing = cries.filter(
      c => c.latitude != null && c.longitude != null && !c.country?.trim(),
    ).slice(0, MAX_PER_RUN);
    if (missing.length === 0) return 0;

    const cache = new Map<string, string | undefined>();
    const resolved: { id: string; country: string }[] = [];

    for (const c of missing) {
      const k = key(c.latitude, c.longitude);
      if (!cache.has(k)) {
        cache.set(k, await reverseCountry(c.latitude, c.longitude));
        await new Promise(r => setTimeout(r, GAP_MS));
      }
      const country = cache.get(k);
      if (country) resolved.push({ id: c.id, country });
    }

    if (resolved.length === 0) return 0;

    // One statement per country rather than per cry: a year of cries in one
    // place is one update, not fifty.
    const byCountry = new Map<string, string[]>();
    for (const r of resolved) {
      const ids = byCountry.get(r.country) ?? [];
      ids.push(r.id);
      byCountry.set(r.country, ids);
    }

    let written = 0;
    for (const [country, ids] of byCountry) {
      const { error } = await supabase
        .from('cries')
        .update({ country })
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
