/**
 * lib/ads.ts — AdMob (Google Mobile Ads) integration.
 *
 * Placement policy (see monetization strategy): ads only ever appear on neutral,
 * low-emotion surfaces — an interstitial at natural breaks in the GLOBAL feed and
 * an optional banner. There is deliberately NO ad after logging a cry. Premium
 * (Teardrop Pro) users never see ads.
 *
 * Flow:
 *  1. initAds() runs once at startup: iOS App Tracking Transparency → UMP consent
 *     (GDPR/EEA) → SDK init → warm up the first interstitial.
 *  2. Screens call maybeShowFeedInterstitial() at natural breaks; it self-gates on
 *     premium status and a frequency cap.
 *  3. <FeedBanner /> renders a banner for non-premium users.
 */
import { Platform } from 'react-native';
import mobileAds, {
  MaxAdContentRating,
  InterstitialAd,
  AdEventType,
  TestIds,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
} from 'react-native-google-mobile-ads';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { checkPremium } from './purchases';

// ─── Ad unit IDs ──────────────────────────────────────────────────────────────
// TODO(before 1.0.5 release): create the ad units in AdMob (each app → Ad units),
// paste the real IDs into REAL_* below, and flip USE_TEST_ADS to false. Until then
// we serve Google's public TEST ads so no real impressions/clicks happen during
// development (clicking your own live ads is a policy violation).
const USE_TEST_ADS = false;

const REAL_INTERSTITIAL = Platform.select({
  android: 'ca-app-pub-4733730200452740/5237814538', // Feed Interstitial (Android)
  ios: 'ca-app-pub-4733730200452740/3404903829',     // Feed Interstitial (iOS)
}) as string;

const REAL_BANNER = Platform.select({
  android: 'ca-app-pub-4733730200452740/4494624212', // Feed Banner (Android)
  ios: 'ca-app-pub-4733730200452740/3924732867',     // Feed Banner (iOS)
}) as string;

export const INTERSTITIAL_UNIT_ID = USE_TEST_ADS ? TestIds.INTERSTITIAL : REAL_INTERSTITIAL;
export const BANNER_UNIT_ID = USE_TEST_ADS ? TestIds.BANNER : REAL_BANNER;

// ─── Init + consent ─────────────────────────────────────────────────────────────

let initialized = false;

/** Runs once at app startup. Safe to call multiple times. */
export async function initAds(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    // 1. iOS App Tracking Transparency — must be requested before showing ads or
    //    Apple rejects under Guideline 5.1.2. No-op on Android.
    if (Platform.OS === 'ios') {
      try { await requestTrackingPermissionsAsync(); } catch { /* user can decline */ }
    }

    // 2. UMP consent (GDPR). Refresh consent info, then show the form only when
    //    the user's region requires it. Non-EEA users sail straight through.
    try {
      await AdsConsent.requestInfoUpdate();
      await AdsConsent.loadAndShowConsentFormIfRequired();
    } catch (e) {
      console.warn('[ads] consent flow failed (continuing):', e);
    }

    // 3. Initialize the SDK with a family-safe content rating.
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();

    // 4. Warm up the first interstitial so it's ready when a break comes.
    preloadInterstitial();
  } catch (e) {
    console.warn('[ads] init failed (ads disabled this session):', e);
  }
}

// ─── Interstitial ───────────────────────────────────────────────────────────────

let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;

function preloadInterstitial() {
  try {
    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID);
    interstitial = ad;
    interstitialLoaded = false;

    const unsub = ad.addAdEventListener(AdEventType.LOADED, () => { interstitialLoaded = true; });
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      interstitialLoaded = false;
      unsub();
      preloadInterstitial(); // queue the next one for later
    });
    ad.addAdEventListener(AdEventType.ERROR, () => { interstitialLoaded = false; });

    ad.load();
  } catch (e) {
    console.warn('[ads] interstitial preload failed:', e);
  }
}

// Never show an interstitial more than once every few minutes, so browsing never
// feels ad-heavy. Also hold off for the first stretch after launch — an ad the
// moment someone opens the app is the classic anti-pattern. Both clocks are
// app-session scoped.
const MIN_INTERSTITIAL_INTERVAL_MS = 3 * 60_000;
const MIN_TIME_SINCE_START_MS = 90_000;
const appStartedAt = Date.now();
let lastInterstitialAt = 0;

/**
 * Shows a feed interstitial if one is ready, the user isn't premium, and the
 * frequency cap allows it. Call at natural breaks in the GLOBAL feed only.
 */
export async function maybeShowFeedInterstitial(): Promise<void> {
  try {
    if (await checkPremium()) return;             // Pro users never see ads
    const now = Date.now();
    if (now - appStartedAt < MIN_TIME_SINCE_START_MS) return;   // not right after launch
    if (now - lastInterstitialAt < MIN_INTERSTITIAL_INTERVAL_MS) return;
    if (!interstitial || !interstitialLoaded) return;

    lastInterstitialAt = now;
    interstitial.show();
  } catch (e) {
    console.warn('[ads] interstitial show failed:', e);
  }
}

// ─── Privacy options (GDPR consent withdrawal) ──────────────────────────────────
// GDPR requires users can change/withdraw consent at any time. Settings shows a
// "Privacy options" row that calls showPrivacyOptions(), but only when UMP says an
// entry point is required (i.e. EEA users) — checked via isPrivacyOptionsRequired().

/** True when a privacy-options entry point must be shown (EEA users). */
export async function isPrivacyOptionsRequired(): Promise<boolean> {
  try {
    const info = await AdsConsent.getConsentInfo();
    return info.privacyOptionsRequirementStatus
      === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    return false;
  }
}

/** Re-opens the consent form so the user can change or withdraw their consent. */
export async function showPrivacyOptions(): Promise<void> {
  try {
    await AdsConsent.showPrivacyOptionsForm();
  } catch (e) {
    console.warn('[ads] privacy options form failed:', e);
  }
}
