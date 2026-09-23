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
import { Platform, AppState } from 'react-native';
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
import { requestPermission } from './permission-queue';

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
    //
    //    Queued, not called directly: iOS refuses to draw this prompt while any
    //    other permission dialog is pending, and returns as if the user had
    //    answered. That is what got 1.0.6 rejected — the reviewer never saw it,
    //    because notifications and location were being requested at the same
    //    moment. See lib/permission-queue.ts.
    if (Platform.OS === 'ios') {
      try {
        await requestPermission(() => requestTrackingPermissionsAsync());
      } catch { /* user can decline, or the prompt was already answered */ }
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
      // PG is "suitable for children with a parent present", which rules out
      // most of the advertisers bidding on a slot like this one. Google lists
      // this ceiling as a common cause of a low match rate, and the banner unit
      // was filling 2.95% of requests. T still keeps alcohol, gambling and
      // sexual content out.
      maxAdContentRating: MaxAdContentRating.T,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();

    // 4. Warm up the first interstitial so it's ready when a break comes, and
    //    give it another go each time the user comes back to the app.
    preloadInterstitial();
    watchForegroundForRetry();
  } catch (e) {
    console.warn('[ads] init failed (ads disabled this session):', e);
  }
}

// ─── Interstitial ───────────────────────────────────────────────────────────────

let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;

// A failed load used to be terminal: interstitialLoaded stayed false and nothing
// ever re-requested, so one no-fill (common for a young app) silently disabled
// interstitials for the rest of the session. Retry a few times with backoff.
//
// The counter only reset on a successful load, which left the same hole one step
// further along: with fill in the low tens of percent, three no-fills in a row is
// ordinary, and after those the session was done asking. It now also resets when
// an ad is closed and whenever the app returns to the foreground, since coming
// back is exactly when the inventory situation may have changed.
const INTERSTITIAL_RETRY_BASE_MS = 60_000;
const MAX_INTERSTITIAL_RETRIES = 3;
let interstitialRetries = 0;

let foregroundWatcherAttached = false;
function watchForegroundForRetry() {
  if (foregroundWatcherAttached) return;
  foregroundWatcherAttached = true;
  AppState.addEventListener('change', state => {
    if (state !== 'active') return;
    if (interstitialLoaded) return;
    interstitialRetries = 0;
    preloadInterstitial();
  });
}

// Every caller funnels through here, so the floor lives here rather than in
// each of them. Measured on a real phone: without it, returning to the
// foreground re-requested immediately and reset the backoff, so a session with
// no fill fired a dozen requests in three minutes, two of them in the same
// second. That is wasted battery and the kind of request pattern AdMob reads
// as misbehaviour.
const MIN_PRELOAD_GAP_MS = 60_000;
let lastPreloadAt = 0;

function preloadInterstitial() {
  const now = Date.now();
  if (now - lastPreloadAt < MIN_PRELOAD_GAP_MS) return;
  lastPreloadAt = now;

  try {
    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID);
    interstitial = ad;
    interstitialLoaded = false;

    // Each preload creates a fresh instance; ignore events from superseded ones
    // so a late callback can't clobber the current ad's state.
    const isCurrent = () => interstitial === ad;

    ad.addAdEventListener(AdEventType.LOADED, () => {
      if (!isCurrent()) return;
      interstitialLoaded = true;
      interstitialRetries = 0;
    });
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      if (!isCurrent()) return;
      interstitialLoaded = false;
      interstitialRetries = 0; // a shown ad proves fill exists — start over clean
      preloadInterstitial(); // queue the next one for later
    });
    ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
      if (!isCurrent()) return;
      interstitialLoaded = false;
      console.warn('[ads] interstitial failed to load:', error?.message ?? error);
      if (interstitialRetries < MAX_INTERSTITIAL_RETRIES) {
        interstitialRetries += 1;
        setTimeout(preloadInterstitial, INTERSTITIAL_RETRY_BASE_MS * interstitialRetries);
      }
    });

    ad.load();
  } catch (e) {
    console.warn('[ads] interstitial preload failed:', e);
  }
}

// Never show an interstitial more than once every few minutes, so browsing never
// feels ad-heavy. Also hold off for the first stretch after launch — an ad the
// moment someone opens the app is the classic anti-pattern. Both clocks are
// app-session scoped.
// Six minutes, not three, and three before the first one rather than ninety
// seconds. Measured on a real phone: three minutes of ordinary tapping around
// the app produced two full-screen ads, which is a lot for an app people open
// because they have just been crying. Fill only started working recently, so
// this trades a little of brand-new revenue for not being the app that
// interrupts you twice on the way to your own feed.
const MIN_INTERSTITIAL_INTERVAL_MS = 6 * 60_000;
const MIN_TIME_SINCE_START_MS = 3 * 60_000;
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
