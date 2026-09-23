/**
 * The one ad banner in the app, in the feed between cries.
 *
 * Measured over the app's whole life to 2026-09-11: the banner unit filled
 * 2.95% of its requests against the interstitial's 39.11%, on 1051 requests
 * and 0.00 kr. earned. Two things in here were part of that, and both are
 * fixed:
 *
 *  - It asked for an ANCHORED adaptive banner, the size meant to sit fixed at
 *    the top or bottom of a screen, while sitting inside scrolling content.
 *    Google deprecated that constant in February 2026 and points scrolling
 *    content at the inline size, which is what this asks for now.
 *  - It re-requested constantly. The slot returned null while its screen was
 *    not focused, so every tab switch tore the banner down and built a new one,
 *    and a failed load was permanent until that happened. Requests that are
 *    abandoned before they are answered still count as requests.
 *
 * It also stopped rendering for Pro users and while the premium check is in
 * flight, and it still collapses rather than leaving a hole when nothing fills.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { BANNER_UNIT_ID } from '../lib/ads';
import { checkPremium } from '../lib/purchases';

/** How long a slot that failed to fill waits before asking again. */
const RETRY_AFTER_MS = 60_000;

/**
 * Without a ceiling an inline adaptive banner may be as tall as the screen,
 * and the first one that filled took 343 dp between two cries. This is a
 * little taller than the old anchored banner and still reads as one row in a
 * feed rather than a page of its own.
 */
const MAX_BANNER_HEIGHT = 120;

/** Never ask for a fresh ad on foreground more often than this. */
const FOREGROUND_REFRESH_FLOOR_MS = 60_000;

interface Props {
  /**
   * Whether this slot may ask for an ad yet. The feed fills its slots from the
   * top down: each one waits until the one above it has an ad. Before, every
   * slot asked at once, and at a 3% fill rate the one that happened to win was
   * as often the third, 24 cries down where almost nobody scrolls, while the
   * one after the first 8 cries had given up and collapsed.
   */
  enabled?: boolean;
  /** Called once this slot has an ad, so the next slot down may start asking. */
  onLoaded?: () => void;
}

export function FeedBanner({ enabled = true, onLoaded }: Props) {
  const [show, setShow] = useState(false);
  const [failed, setFailed] = useState(false);
  // Changing this remounts the BannerAd, which is how this library asks for a
  // new ad: "each render of the component loads a single advert".
  const [adKey, setAdKey] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastRefreshAt = useRef(Date.now());

  useEffect(() => {
    let mounted = true;
    checkPremium()
      .then(isPremium => { if (mounted) setShow(!isPremium); })
      .catch(() => { /* leave hidden on error */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  // The library's own note: on iOS the WKWebView behind an ad can be killed
  // while the app is suspended, leaving a blank slot, so ask for a fresh ad
  // when the app comes back. The floor keeps a user who switches apps often
  // from turning that into a stream of requests.
  useEffect(() => {
    // iOS only, as the library says: on Android the ad view survives the
    // background, and asking again would only swap a working ad for a request
    // that probably fills nothing.
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      if (Date.now() - lastRefreshAt.current < FOREGROUND_REFRESH_FLOOR_MS) return;
      lastRefreshAt.current = Date.now();
      setAdKey(k => k + 1);
    });
    return () => sub.remove();
  }, []);

  if (!show || failed || !enabled) return null;

  return (
    <View style={styles.wrap}>
      <BannerAd
        key={adKey}
        unitId={BANNER_UNIT_ID}
        size={BannerAdSize.INLINE_ADAPTIVE_BANNER}
        maxHeight={MAX_BANNER_HEIGHT}
        onAdLoaded={() => onLoaded?.()}
        onAdFailedToLoad={error => {
          // No fill is ordinary here. Collapse the slot so there is no gap
          // between cries, and try again in a minute: supply comes and goes,
          // and giving up for the session was costing the slot outright.
          console.warn('[ads] banner failed to load:', error?.message ?? error);
          setFailed(true);
          clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => setFailed(false), RETRY_AFTER_MS);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Google's placement policy: ads next to things people tap are the biggest
  // cause of accidental clicks, and accidental clicks are what gets ad serving
  // disabled. The rows above and below are both tappable, so the slot keeps its
  // distance and separates itself with rules rather than sitting flush.
  wrap: {
    alignItems: 'center',
    paddingVertical: 18,
    backgroundColor: '#0d1117',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1f2937',
  },
});
