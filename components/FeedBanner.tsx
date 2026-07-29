/**
 * Ad banner used in the feed (between cries) and at the bottom of the profile,
 * stats and calendar screens. Renders nothing for Pro users, while the premium
 * check is in flight, or when the ad fails to fill — an empty reserved slot
 * would otherwise leave a visible hole in the layout.
 */
import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { BANNER_UNIT_ID } from '../lib/ads';
import { checkPremium } from '../lib/purchases';

export function FeedBanner() {
  const [show, setShow] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    checkPremium()
      .then(isPremium => { if (mounted) setShow(!isPremium); })
      .catch(() => { /* leave hidden on error */ });
    return () => { mounted = false; };
  }, []);

  if (!show || failed) return null;

  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={BANNER_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={error => {
          // No fill is normal for a new app/unit — collapse the slot rather than
          // leaving an empty gap between cries.
          console.warn('[ads] banner failed to load:', error?.message ?? error);
          setFailed(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 6, backgroundColor: '#0d1117' },
});
