/**
 * Feed banner — an anchored adaptive AdMob banner shown at the bottom of the
 * feed for non-premium users. Renders nothing for Pro users (or while the
 * premium check is in flight, so there's no flash of empty ad space).
 */
import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { BANNER_UNIT_ID } from '../lib/ads';
import { checkPremium } from '../lib/purchases';

export function FeedBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let mounted = true;
    checkPremium()
      .then(isPremium => { if (mounted) setShow(!isPremium); })
      .catch(() => { /* leave hidden on error */ });
    return () => { mounted = false; };
  }, []);

  if (!show) return null;

  return (
    <View style={styles.wrap}>
      <BannerAd unitId={BANNER_UNIT_ID} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 6, backgroundColor: '#0d1117' },
});
