import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { syncLocalToSupabase } from './storage';

/**
 * Auto-provision a profile for a Sign in with Apple user who has no username yet.
 *
 * App Store Review Guideline 4 (Sign in with Apple) forbids asking the user to
 * re-enter their name/email after authenticating with Apple — that data is
 * already supplied by Apple. So instead of routing Apple users to the profile-
 * setup screen, we generate a username and seed the display name from the Apple
 * credential. The display name stays editable later in the Profile tab.
 *
 * Returns true if a username was set (caller then skips the setup screen).
 */
async function autoProvisionAppleProfile(user: User): Promise<boolean> {
  // Re-fetch the user first: apple-auth.ts writes the Apple-provided name to
  // user_metadata via updateUser() right after sign-in, which races with the
  // SIGNED_IN event that got us here. A fresh read usually sees the name.
  const { data: freshData } = await supabase.auth.getUser();
  const meta = ((freshData?.user ?? user).user_metadata ?? {}) as Record<string, unknown>;
  const rawName = String(meta.display_name ?? meta.full_name ?? meta.name ?? '').trim();
  const base = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14) || 'tear';

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${base}_${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 20);
    const { data: taken, error: rpcErr } = await supabase.rpc('is_username_taken', { uname: candidate });
    if (rpcErr) return false;
    if (taken) continue;

    const { error } = await supabase
      .from('profiles')
      .update({
        username: candidate,
        display_name: rawName || candidate,
        profile_visibility: 'everyone',
      })
      .eq('id', user.id);
    if (!error) return true;
    if (error.code !== '23505') return false; // not a uniqueness clash → give up
  }
  return false;
}

type AuthCtx = {
  session: Session | null;
  loading: boolean;
  hasUsername: boolean | null; // null = still checking
  refreshUsername: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  session: null,
  loading: true,
  hasUsername: null,
  refreshUsername: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUsername, setHasUsername] = useState<boolean | null>(null);

  async function checkUsername(user: User) {
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();

    if (data?.username) { setHasUsername(true); return; }

    // No username yet. Sign in with Apple users must not be sent to a profile-
    // setup screen that re-asks for their name (Guideline 4). Auto-provision and
    // skip straight into the app; everyone else sets a username manually.
    if (user.app_metadata?.provider === 'apple') {
      const provisioned = await autoProvisionAppleProfile(user);
      setHasUsername(provisioned);
      return;
    }

    setHasUsername(false);
  }

  async function refreshUsername() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await checkUsername(session.user);
  }

  useEffect(() => {
    // Rehydrate session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session) {
        checkUsername(session.user);
        // Push any cries logged while offline (the pending queue) — without
        // this they only synced on a fresh SIGNED_IN, so a logged-in user who
        // saved offline wouldn't see them again until next login.
        syncLocalToSupabase(session.user.id, session.user.email ?? undefined)
          .catch(e => console.warn('[auth] sync-on-start failed:', e));
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);

        // When a user signs in, upload any locally stored guest cries to their account
        if (event === 'SIGNED_IN' && session) {
          checkUsername(session.user);
          syncLocalToSupabase(session.user.id, session.user.email ?? undefined)
            .catch(e => console.warn('[auth] sync-on-login failed:', e));
        }
        if (event === 'SIGNED_OUT') {
          setHasUsername(null);
        }
      }
    );

    // ── Android OAuth deep-link handler ──────────────────────────────────────
    // On Android we open OAuth in the full browser (Linking.openURL) rather
    // than a Custom Tab, because Custom Tabs don't dispatch exp:// intents.
    // When Chrome redirects to exp://192.168.x.x:8081?code=XXX, Android
    // routes the intent to Expo Go. We catch it here and exchange the code.
    const handleUrl = async ({ url }: { url: string }) => {
      console.log('[auth] incoming URL:', url.substring(0, 120));

      // PKCE flow: teardrop://?code=XXX
      if (url.includes('code=') && !url.includes('#')) {
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (error) console.warn('[auth] exchangeCodeForSession failed:', error.message);
        return;
      }

      // Implicit flow: teardrop://#access_token=XXX&refresh_token=YYY
      if (url.includes('access_token=')) {
        const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
        const params = new URLSearchParams(fragment);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) console.warn('[auth] setSession failed:', error.message);
        }
      }
    };

    const linkingSub = Linking.addEventListener('url', handleUrl);

    // Handle cold-start: app opened directly from the exp:// deep link
    Linking.getInitialURL().then(url => {
      if (url?.includes('code=')) handleUrl({ url });
    });

    return () => {
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, hasUsername, refreshUsername }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
