import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../lib/auth';
import { registerPushToken, clearBadge } from '../lib/notifications';

function RootNav() {
  const { session, loading, hasUsername } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);

  // ── Auth routing ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    const onSetup = inAuth && segments[1] === 'setup-profile';

    if (!session) return; // Guest — free to roam

    if (hasUsername === null) return;

    if (!hasUsername && !onSetup) {
      router.replace('/(auth)/setup-profile');
    } else if (hasUsername && inAuth) {
      router.replace('/(tabs)/');
    }
  }, [session, loading, hasUsername, segments]);

  // ── Push token registration ───────────────────────────────────────────────
  useEffect(() => {
    if (session && hasUsername) {
      registerPushToken();
    }
  }, [session?.user.id, hasUsername]);

  // ── Handle notification taps (background / quit state) ───────────────────
  useEffect(() => {
    // Handle notification that launched the app from quit/background
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleNotificationResponse(response);
    });

    // Listen for taps while app is running in background
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
      <Stack.Screen name="log-cry" options={{ presentation: 'modal' }} />
      <Stack.Screen name="friends" options={{ presentation: 'modal' }} />
      <Stack.Screen name="user-profile" options={{ presentation: 'modal' }} />
      <Stack.Screen name="my-cries" options={{ presentation: 'modal' }} />
      <Stack.Screen name="follow-list" options={{ presentation: 'modal' }} />
    </Stack>

  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNav />
    </AuthProvider>
  );
}
