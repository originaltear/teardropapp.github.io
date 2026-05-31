import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../lib/auth';

function RootNav() {
  const { session, loading, hasUsername } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    const onSetup = inAuth && segments[1] === 'setup-profile';

    if (!session) return; // Guest — free to roam

    // Logged in but username check still loading — wait
    if (hasUsername === null) return;

    if (!hasUsername && !onSetup) {
      // New user — needs to pick a username
      router.replace('/(auth)/setup-profile');
    } else if (hasUsername && inAuth) {
      // Profile complete — go to app
      router.replace('/(tabs)/');
    }
  }, [session, loading, hasUsername, segments]);

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
