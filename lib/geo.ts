/**
 * Geocoding helpers shared by the full log screen and the quick-log sheet.
 */
import * as Location from 'expo-location';

export interface ReverseCountry {
  /**
   * The country as the device geocoder gave it, which is in the phone's own
   * language: a Danish phone says "Danmark", an English one "Denmark", a
   * Chinese one "中国". Kept as the label, because reading your own country in
   * your own language is nicer than being shown someone else's word for it.
   */
  name?: string;
  /**
   * ISO 3166-1 alpha-2. The same two letters whatever the phone's language, so
   * this is what anything counting by country groups on.
   *
   * Before this existed, `country` was doing both jobs and failing the second:
   * across every cry, Denmark was stored as "Danmark" (41 rows) and "Denmark"
   * (6), the United States as "USA" and "United States". The recap counted one
   * nation twice and the flag lookup, which matches English names, fell through
   * to a grey globe for most of the data.
   */
  code?: string;
}

/**
 * Reverse-geocodes coordinates to a country. Best-effort and bounded — a
 * hanging geocoder must never leave a save button spinning.
 */
export async function reverseCountry(
  latitude: number,
  longitude: number,
  timeoutMs = 3000,
): Promise<ReverseCountry> {
  try {
    const geo = await Promise.race([
      Location.reverseGeocodeAsync({ latitude, longitude }),
      new Promise<null>(res => setTimeout(() => res(null), timeoutMs)),
    ]);
    const hit = geo?.[0];
    return {
      name: hit?.country ?? undefined,
      code: hit?.isoCountryCode?.toUpperCase() ?? undefined,
    };
  } catch {
    return {}; // geocoding failure is never fatal
  }
}

/**
 * The flag for an ISO country code, built from the two regional indicator
 * letters rather than looked up.
 *
 * This replaces a hand-written table of 68 countries that silently returned a
 * grey globe for everything outside it. Arithmetic covers all of them and can
 * never fall behind.
 */
export function countryFlag(code?: string | null): string {
  const c = code?.trim().toUpperCase();
  if (!c || c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return '🌍';
  return String.fromCodePoint(
    ...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}
