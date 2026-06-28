/**
 * lib/ads.ts — Ad gating + placeholder
 *
 * AppLovin integration is pending until the app is live in the store.
 * All ad logic lives here so wiring it up later is a single-file change.
 *
 * Flow when AppLovin is ready:
 *  1. Install react-native-applovin-max
 *  2. Init AppLovin SDK in app/_layout.tsx (MAX.initialize)
 *  3. On iOS, request App Tracking Transparency BEFORE the first ad
 *     (expo-tracking-transparency + NSUserTrackingUsageDescription) — required
 *     for personalised ads or Apple rejects under Guideline 5.1.2.
 *  4. Replace the stub in showPostCryAd() with MAX.showInterstitial()
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkPremium } from './purchases';

// ─── Safe-guards ──────────────────────────────────────────────────────────────
// People normally log a single cry per session, so "an ad after every cry" is
// fine in the common case. These guards only protect the edge cases:
//  - logging several cries back-to-back (e.g. backfilling old ones)
//  - a brand-new user's very first cry (give a clean first impression)

/** Never show two interstitials within this window. */
const MIN_AD_INTERVAL_MS = 60_000;
/** Skip the ad for the user's first N logged cries on this device. */
const GRACE_CRIES = 1;
const COUNT_KEY = 'teardrop_logged_cry_count';

let lastAdShownAt = 0;

/**
 * Call this immediately after a cry is saved.
 * Premium users are skipped automatically.
 * Non-premium users will see an interstitial once AppLovin is wired up,
 * subject to the safe-guards above.
 */
export async function showPostCryAd(): Promise<void> {
  // Premium users never see ads
  const isPremium = await checkPremium();
  if (isPremium) return;

  // New-user grace — no ad on the very first cry/cries.
  let count = 0;
  try {
    count = parseInt((await AsyncStorage.getItem(COUNT_KEY)) ?? '0', 10) + 1;
    await AsyncStorage.setItem(COUNT_KEY, String(count));
  } catch {
    // Non-fatal — if storage fails we just fall through to the interval guard.
  }
  if (count <= GRACE_CRIES) return;

  // Rate-limit — never two ads in quick succession (back-to-back logging).
  const now = Date.now();
  if (now - lastAdShownAt < MIN_AD_INTERVAL_MS) return;
  lastAdShownAt = now;

  // ─── AppLovin integration pending ────────────────────────────────────────────
  // TODO: replace the console.log below with the actual AppLovin interstitial call:
  //
  //   import AppLovinMAX from 'react-native-applovin-max';
  //   const AD_UNIT_ID = 'YOUR_APPLOVIN_INTERSTITIAL_UNIT_ID';
  //   if (AppLovinMAX.isInterstitialReady(AD_UNIT_ID)) {
  //     AppLovinMAX.showInterstitial(AD_UNIT_ID);
  //   }
  //
  console.log('[Ads] Ad would show here — AppLovin integration pending');
}
