import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { syncLocalToSupabase } from './storage';

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

  async function checkUsername(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();
    setHasUsername(!!data?.username);
  }

  async function refreshUsername() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await checkUsername(session.user.id);
  }

  useEffect(() => {
    // Rehydrate session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session) {
        checkUsername(session.user.id);
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
          checkUsername(session.user.id);
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
