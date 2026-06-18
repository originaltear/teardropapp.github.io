// Platform-specific: iOS only — native Sign in with Apple
/**
 * Native Sign in with Apple → Supabase.
 *
 * On iOS we use AppleAuthentication.signInAsync() to obtain an identity token
 * from the system, then exchange it for a Supabase session via
 * signInWithIdToken. This is the privacy-focused login option required by App
 * Store Review Guideline 4.8 alongside any third-party login.
 *
 * Supabase setup (one-time, in the dashboard):
 *   Authentication → Providers → Apple → enable, then add this app's bundle id
 *   `com.originaltear.teardrop` to "Authorized Client IDs". No secret key is
 *   needed for the native id-token flow.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

export type AppleSignInResult = 'success' | 'cancelled' | 'error';

/** True only on iOS devices that support Sign in with Apple. */
export async function isAppleAuthAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      console.warn('[apple-auth] No identity token returned by Apple');
      return 'error';
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) {
      console.warn('[apple-auth] signInWithIdToken error:', error.message);
      return 'error';
    }

    // Apple only returns the full name on the FIRST authorization. When present,
    // seed the user's display_name so the profile-setup step is pre-filled.
    const fullName = credential.fullName;
    const displayName = [fullName?.givenName, fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (displayName && data.user) {
      await supabase.auth
        .updateUser({ data: { display_name: displayName } })
        .catch(() => { /* non-fatal: name is also collected in profile setup */ });
    }

    return 'success';
  } catch (e: any) {
    // User dismissed the native Apple sheet
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') {
      return 'cancelled';
    }
    console.warn('[apple-auth] error:', e?.message ?? e);
    return 'error';
  }
}
