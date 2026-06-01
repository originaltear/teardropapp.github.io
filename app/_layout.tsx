import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../lib/auth';
import { registerPushToken, clearBadge } from '../lib/notifications';
import { initPurchases, syncCrystalTear } from '../lib/purchases';
import { ThemeContext, loadSavedTheme, saveTheme, DEFAULT_THEME, type ThemeDef } from '../lib/themes';
import { ONBOARDING_KEY } from './onboarding';

// ─── Root navigation + providers ──────────────────────────────────────────────

function RootNav() {
  const { session, loading, hasUsername } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);

  // ── Auth routing ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const segs = segments as string[];
    const inAuth   = segs[0] === '(auth)';
    const onSetup  = inAuth && segs[1] === 'setup-profile';
    const onOnboarding = segs[0] === 'onboarding';

    // Don't interrupt onboarding
    if (onOnboarding) return;

    if (!session) return; // Guest — free to roam

    if (hasUsername === null) return;

    if (!hasUsername && !onSetup) {
      router.replace('/(auth)/setup-profile');
    } else if (hasUsername && inAuth) {
      router.replace('/(tabs)/');
    }
  }, [session, loading, hasUsername, segments]);

  // ── RevenueCat init + Crystal Tear sync ──────────────────────────────────
  useEffect(() => {
    if (session?.user.id) {
      initPurchases(session.user.id);
      syncCrystalTear(session.user.id);
    } else {
      // Init without user ID for guest state
      initPurchases();
    }
  }, [session?.user.id]);

  // ── Push token registration ───────────────────────────────────────────────
  useEffect(() => {
    if (session && hasUsername) {
      registerPushToken();
    }
  }, [session?.user.id, hasUsername]);

  // ── Handle notification taps (background / quit state) ───────────────────
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleNotificationResponse(response);
    });

    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );

    return () => {
      notifListenerRef.current?.remove();
    };
  }, []);

  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data as Record<string, string> | undefined;
    if (!data) return;
    clearBadge();
    const { type, cry_id } = data;
    if ((type === 'like' || type === 'comment') && cry_id) {
      router.push(`/cry-detail?id=${cry_id}`);
    } else if (type === 'follow' || type === 'friend_request') {
      router.push('/(tabs)/notifications');
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0d1117', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#6fe0e6" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="paywall"  options={{ presentation: 'modal' }} />
      <Stack.Screen name="log-cry"  options={{ presentation: 'modal' }} />
      <Stack.Screen name="friends"       options={{ presentation: 'modal' }} />
      <Stack.Screen name="user-profile"  options={{ presentation: 'modal' }} />
      <Stack.Screen name="my-cries"      options={{ presentation: 'modal' }} />
      <Stack.Screen name="follow-list"   options={{ presentation: 'modal' }} />
    </Stack>
  );
}

// ─── Onboarding gate (checks AsyncStorage before rendering) ──────────────────

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const done = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (!done) {
        // Haven't seen onboarding yet — redirect once app is mounted
        const segs = segments as string[];
        const alreadyOnOnboarding = segs[0] === 'onboarding';
        if (!alreadyOnOnboarding) {
          router.replace('/onboarding');
        }
      }
      setChecked(true);
    })();
  }, []);

  if (!checked) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0d1117', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#6fe0e6" />
      </View>
    );
  }

  return <>{children}</>;
}

// ─── Theme provider wrapper ───────────────────────────────────────────────────

function ThemedApp() {
  const [theme, setThemeState] = useState<ThemeDef>(DEFAULT_THEME);

  useEffect(() => {
    loadSavedTheme().then(setThemeState);
  }, []);

  function setTheme(t: ThemeDef) {
    setThemeState(t);
    saveTheme(t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <AuthProvider>
        <OnboardingGate>
          <RootNav />
        </OnboardingGate>
      </AuthProvider>
    </ThemeContext.Provider>
  );
}

export default function RootLayout() {
  return <ThemedApp />;
}
