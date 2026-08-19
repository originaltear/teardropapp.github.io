/**
 * Geocoding helpers shared by the full log screen and the quick-log sheet.
 */
import * as Location from 'expo-location';

/**
 * Turns an ISO country code into an English country name.
 *
 * The device geocoder answers in the phone's language, so the same country
 * arrived in the database under whatever the user happened to have set. A count
 * across every cry showed Denmark stored as both "Danmark" (41) and "Denmark"
 * (6), the United States as both "USA" and "United States", Germany as
 * "Tyskland" and China as "中国" — one country counted twice on the recap, and
 * the flag lookup, which matches English names, falling through to a grey globe
 * for most of the data.
 *
 * The ISO code does not move with the phone's language, so it is the thing to
 * trust.
 *
 * MEASURED 2026-08-19 on a Galaxy S23 running this build: Intl.DisplayNames is
 * undefined. Hermes does not ship it here, so today this function always takes
 * the fallback and new cries still store the localised name. It is left in
 * because it costs nothing and starts working the day the engine gains it, but
 * do not mistake it for a fix — the drift is only really solved by storing the
 * ISO code itself and grouping on that.
 */
function englishCountry(iso?: string | null, fallback?: string | null): string | undefined {
  if (iso) {
    try {
      const DisplayNames = (Intl as unknown as {
        DisplayNames?: new (l: string[], o: { type: string }) => { of(c: string): string | undefined };
      }).DisplayNames;
      if (DisplayNames) {
        const name = new DisplayNames(['en'], { type: 'region' }).of(iso);
        // `of` hands back the input unchanged when it does not recognise it.
        if (name && name !== iso) return name;
      }
    } catch { /* fall through to the localised name */ }
  }
  return fallback ?? undefined;
}

/**
 * Reverse-geocodes coordinates to a country name. Best-effort and bounded —
 * a hanging geocoder must never leave a save button spinning.
 */
export async function reverseCountry(
  latitude: number,
  longitude: number,
  timeoutMs = 3000,
): Promise<string | undefined> {
  try {
    const geo = await Promise.race([
      Location.reverseGeocodeAsync({ latitude, longitude }),
      new Promise<null>(res => setTimeout(() => res(null), timeoutMs)),
    ]);
    const hit = geo?.[0];
    return englishCountry(hit?.isoCountryCode, hit?.country);
  } catch {
    return undefined; // geocoding failure is never fatal
  }
}
