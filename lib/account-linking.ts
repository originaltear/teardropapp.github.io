// Platform-specific: iOS + Android (OAuth browser flow differs per platform)
/**
 * Account linking — attach additional login providers to the signed-in user.
 *
 * Uses Supabase Auth manual identity linking so a user who signed in with, say,
 * Apple can also link Google (and vice-versa) and afterwards log in with either.
 *
 * Supabase setup (one-time, in the dashboard):
 *   - Authentication → Settings → enable "Allow manual linking".
 *   - The provider being linked must be enabled. Google is already configured.
 *     Linking Apple uses Apple's *web* OAuth flow, so the Apple provider needs a
 *     Services ID + Secret Key configured (the native id-token setup alone is not
 *     enough for linking).
 */

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './supabase';
import type { UserIdentity } from '@supabase/supabase-js';

export type LinkableProvider = 'google' | 'apple';
export type LinkResult = 'success' | 'cancelled' | 'error';

const PROVIDER_LABEL: Record<string, string> = {
  apple: 'Apple',
  google: 'Google',
  email: 'Email',
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

/** All identities currently linked to the signed-in user. */
export async function getLinkedIdentities(): Promise<UserIdentity[]> {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) {
    console.warn('[account-linking] getUserIdentities error:', error.message);
    return [];
  }
  return data?.identities ?? [];
}

/**
 * Start the OAuth flow to link an additional provider to the current account.
 * Mirrors lib/oauth.ts: Android opens the full browser (the deep-link listener
 * in AuthProvider finishes the exchange), iOS uses ASWebAuthenticationSession.
 */
export async function linkProvider(provider: LinkableProvider): Promise<LinkResult> {
  try {
    const redirectTo = makeRedirectUri({ scheme: 'teardrop' });
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) {
      console.warn('[account-linking] linkIdentity error:', error.message);
      return 'error';
    }
    if (!data?.url) return 'error';

    if (Platform.OS === 'android') {
      // Full browser dispatches the teardrop:// callback; AuthProvider's Linking
      // listener exchanges the code and the new identity is applied server-side.
      await Linking.openURL(data.url);
      return 'success';
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'cancel' || result.type === 'dismiss') return 'cancelled';
    if (result.type === 'success') {
      const { error: exchErr } = await supabase.auth.exchangeCodeForSession(result.url);
      if (exchErr) {
        console.warn('[account-linking] exchange error:', exchErr.message);
        return 'error';
      }
      return 'success';
    }
    return 'error';
  } catch (e: any) {
    console.warn('[account-linking] error:', e?.message ?? e);
    return 'error';
  }
}

/**
 * Unlink a provider from the account. Supabase refuses to remove the user's last
 * identity, so callers should keep at least one linked.
 */
export async function unlinkProvider(identity: UserIdentity): Promise<LinkResult> {
  try {
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (error) {
      console.warn('[account-linking] unlinkIdentity error:', error.message);
      return 'error';
    }
    return 'success';
  } catch (e: any) {
    console.warn('[account-linking] unlinkIdentity error:', e?.message ?? e);
    return 'error';
  }
}
