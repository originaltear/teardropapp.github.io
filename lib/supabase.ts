import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey  = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Fail loud and clear if env vars weren't inlined at build time (e.g. a preview/
// release build missing an `env` block in eas.json). Without this, the Supabase
// SDK throws an opaque "supabaseUrl is required" at import time and the app
// crashes instantly with no useful clue in logcat.
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[Teardrop] Missing Supabase env vars (EXPO_PUBLIC_SUPABASE_URL / ' +
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY). These must be inlined at build time — ' +
    'check the `env` block in eas.json for the build profile, or .env for local builds.',
  );
}

// Use AsyncStorage for auth token persistence — SecureStore has Android value-size limits
// that cause JWT tokens to be silently dropped.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage as never,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// The auto-refresh timer is suspended while Android backgrounds the JS thread,
// so a long-backgrounded app can resume with an expired token and fail its
// first requests. Drive the timer from AppState (official Supabase RN guidance)
// so a resumed app refreshes immediately.
AppState.addEventListener('change', state => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
