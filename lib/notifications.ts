/**
 * Push notification registration + local notification handler.
 *
 * Architecture:
 *  - On login, registerPushToken() stores the Expo push token in profiles.push_token
 *  - A Supabase Edge Function (send-push) is triggered by a DB webhook on
 *    notifications INSERT and calls the Expo Push API
 *  - On Android the default channel is created automatically by the plugin;
 *    this file ensures it exists at runtime too.
 *
 * Requirements to enable push (one-time setup, done outside this file):
 *  1. Run `eas login && eas init` to link the project and get a project ID
 *  2. Add the project ID to app.json under expo.extra.eas.projectId
 *  3. For Android: upload FCM v1 service-account key to EAS dashboard
 *  4. Rebuild the app with `npx expo run:android`
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// ─── Global handler (shown while app is foregrounded) ─────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Android channel ──────────────────────────────────────────────────────────

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Teardrop',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: '#6fe0e6',
    showBadge: true,
  });
}

// ─── Token registration ───────────────────────────────────────────────────────

/**
 * Requests permission and registers the Expo push token in the user's profile.
 * Safe to call multiple times — silently no-ops if permission denied or EAS not
 * configured.
 */
export async function registerPushToken(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  try {
    await ensureAndroidChannel();

    // Ask for permission
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[notifications] Push permission denied — not registering token');
      return;
    }

    // Project ID injected by eas init into app.json → expo.extra.eas.projectId
    const projectId: string | undefined =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      '6983c0e9-26de-4056-b0f5-5cef62d50bc3'; // fallback: hardcoded from eas init

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    const token = tokenData.data;

    // Persist to Supabase (upsert-style: only write if changed)
    const { data: existing_ } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', session.user.id)
      .single();

    if (existing_?.push_token !== token) {
      await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', session.user.id);
      console.log('[notifications] Push token registered:', token.slice(0, 30) + '…');
    }
  } catch (err: any) {
    // Don't crash the app if push setup fails (e.g., no EAS project yet)
    console.warn('[notifications] Token registration skipped:', err?.message ?? err);
  }
}

/**
 * Clears the push token from the profile (call on logout).
 */
export async function clearPushToken(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase
    .from('profiles')
    .update({ push_token: null })
    .eq('id', session.user.id);
}

// ─── Badge management ─────────────────────────────────────────────────────────

export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Non-fatal
  }
}

export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}
