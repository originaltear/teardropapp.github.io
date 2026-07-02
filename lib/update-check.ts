// Platform-specific: iOS + Android (store URLs differ)
/**
 * In-app "update available" prompt.
 *
 * Compares the running version against `app_config.latest_version_{ios,android}`
 * in Supabase, and shows a one-time alert per new version linking to the store.
 *
 * Release workflow: after a new version is live in the stores, bump the
 * matching column in the app_config row (Supabase dashboard) — existing
 * installs will prompt on their next launch. No new build needed to trigger it.
 */

import { Platform, Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const STORE_URL = Platform.OS === 'ios'
  ? 'https://apps.apple.com/app/id6779766330'
  : 'https://play.google.com/store/apps/details?id=com.originaltear.teardrop';

/** Remembers which version we've already prompted for — never nag per launch. */
const PROMPTED_KEY = 'teardrop_update_prompted_version';

/** True when `latest` is a strictly newer x.y.z than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map(n => parseInt(n, 10) || 0);
  const c = current.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const a = l[i] ?? 0, b = c[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/** Call once shortly after startup. Never throws, never blocks launch. */
export async function checkForUpdate(): Promise<void> {
  try {
    const current = Constants.expoConfig?.version;
    if (!current) return;

    const { data } = await supabase
      .from('app_config')
      .select('latest_version_ios, latest_version_android')
      .eq('id', 1)
      .single();

    const latest = Platform.OS === 'ios'
      ? data?.latest_version_ios
      : data?.latest_version_android;
    if (!latest || !isNewerVersion(latest, current)) return;

    // Only prompt once per new version
    const prompted = await AsyncStorage.getItem(PROMPTED_KEY);
    if (prompted === latest) return;
    await AsyncStorage.setItem(PROMPTED_KEY, latest);

    Alert.alert(
      'Update available 💧',
      `Teardrop ${latest} is out with improvements and fixes.`,
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Update', onPress: () => Linking.openURL(STORE_URL) },
      ],
    );
  } catch {
    // Best-effort — an update prompt must never break startup
  }
}
