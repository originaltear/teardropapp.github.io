/**
 * Shared OAuth helpers used by both login and signup screens.
 *
 * Android problem: Chrome Custom Tabs do NOT dispatch Android intents for
 * custom schemes like exp://. They just spin trying to load the URL as a
 * webpage. Fix: use Linking.openURL on Android (opens full Chrome browser
 * which DOES dispatch exp:// to Expo Go via Android intent system).
 * The callback is caught by the Linking listener in AuthProvider (auth.tsx).
 *
 * iOS: ASWebAuthenticationSession handles custom scheme redirects natively,
 * so openAuthSessionAsync works perfectly there.
 */

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

export function getRedirectUri(): string {
  return makeRedirectUri({ scheme: 'teardrop' });
}

export function friendlyOAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes('not enabled') ||
    (lower.includes('provider') && lower.includes('enable')) ||
    (lower.includes('oauth') && (lower.includes('disabled') || lower.includes('not configured')))
  ) {
    return 'This login method is not available yet. Please use email and password.';
  }
  return raw || 'Sign-in failed. Please try again.';
}

export async function runOAuth(provider: 'google' | 'facebook'): Promise<void> {
  const redirectTo = getRedirectUri();
  console.log('[oauth] redirectTo:', redirectTo, '| platform:', Platform.OS);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  if (Platform.OS === 'android') {
    // Full browser (not Custom Tab) — Chrome will dispatch exp:// to Expo Go
    // via Android intent system. The AuthProvider Linking listener handles the
    // code exchange once Expo Go receives the deep link.
    console.log('[oauth] android: opening full browser');
    await Linking.openURL(data.url);
    // Returns immediately; auth completes asynchronously via Linking handler.
  } else {
    // iOS: ASWebAuthenticationSession intercepts custom schemes natively.
    console.log('[oauth] ios: opening auth session');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    console.log('[oauth] browser result:', result.type);
    if (result.type === 'success') {
      const { error: exchErr } = await supabase.auth.exchangeCodeForSession(result.url);
      if (exchErr) throw exchErr;
    }
  }
}
