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
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { BANNER_UNIT_ID } from '../lib/ads';
import { checkPremium } from '../lib/purchases';

/** How long a slot that failed to fill waits before asking again. */
const RETRY_AFTER_MS = 60_000;

export function FeedBanner() {
  const [show, setShow] = useState(false);
  const [failed, setFailed] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    checkPremium()
      .then(isPremium => { if (mounted) setShow(!isPremium); })
      .catch(() => { /* leave hidden on error */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  if (!show || failed) return null;

  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={BANNER_UNIT_ID}
        size={BannerAdSize.INLINE_ADAPTIVE_BANNER}
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
  wrap: { alignItems: 'center', paddingVertical: 6, backgroundColor: '#0d1117' },
});
