/**
 * lib/ads.ts — Ad placeholder
 *
 * AppLovin integration is pending until the app is live in the store.
 * All ad logic lives here so wiring it up later is a single-file change.
 *
 * Flow when AppLovin is ready:
 *  1. Install react-native-applovin-max
 *  2. Init AppLovin SDK in app/_layout.tsx (MAX.initialize)
 *  3. Replace the stub in showPostCryAd() with MAX.showInterstitial()
 */

import { checkPremium } from './purchases';

/**
 * Call this immediately after a cry is saved.
 * Premium users are skipped automatically.
 * Non-premium users will see an interstitial once AppLovin is wired up.
 */
export async function showPostCryAd(): Promise<void> {
  // Premium users never see ads
  const isPremium = await checkPremium();
  if (isPremium) return;

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
