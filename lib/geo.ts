/**
 * Geocoding helpers shared by the full log screen and the quick-log sheet.
 */
import * as Location from 'expo-location';

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
    return geo?.[0]?.country ?? undefined;
  } catch {
    return undefined; // geocoding failure is never fatal
  }
}
