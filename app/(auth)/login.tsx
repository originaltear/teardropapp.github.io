import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ── Email / password sign-in ──────────────────────────────────────────────

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    }
    // On success the AuthProvider listener fires and RootNav redirects automatically
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      const redirectTo = makeRedirectUri({ scheme: 'teardrop' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success') {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
          if (exchangeError) throw exchangeError;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setError(msg);
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>💧</Text>
            </View>
            <Text style={styles.appName}>Teardrop</Text>
            <Text style={styles.tagline}>Your emotional atlas</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#4a5568"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#4a5568"
              secureTextEntry
              textContentType="password"
              onSubmitEditing={handleLogin}
              returnKeyType="done"
            />

            {error ? <Text style={styles.errorTxt}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#0d1117" />
                : <Text style={styles.btnTxt}>Log in</Text>}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerTxt}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
              onPress={handleGoogle}
              disabled={googleLoading}
              activeOpacity={0.85}
            >
              {googleLoading
                ? <ActivityIndicator color="#e2e8f0" />
                : <>
                    <Text style={styles.googleIcon}>G</Text>
                    <Text style={styles.googleTxt}>Continue with Google</Text>
                  </>}
            </TouchableOpacity>
          </View>

          {/* Sign-up link */}
          <TouchableOpacity
            style={styles.switchRow}
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.7}
          >
            <Text style={styles.switchTxt}>Don't have an account? </Text>
            <Text style={styles.switchLink}>Sign up</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 32, justifyContent: 'center' },

  logoArea: { alignItems: 'center', marginBottom: 48, gap: 8 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#6fe0e6',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6fe0e6', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 12,
  },
  logoEmoji: { fontSize: 36 },
  appName: { color: '#e2e8f0', fontSize: 28, fontWeight: '800', letterSpacing: 0.5 },
  tagline: { color: '#4a5568', fontSize: 14, fontFamily: 'monospace' },

  form: { gap: 4 },
  label: { color: '#94a3b8', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  input: {
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#e2e8f0', fontSize: 15,
  },
  errorTxt: { color: '#ef6f6f', fontSize: 13, marginTop: 8, lineHeight: 18 },

  btn: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 24,
  },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#1f2937' },
  dividerTxt: { color: '#374151', fontSize: 12, fontFamily: 'monospace' },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 14, paddingVertical: 14,
  },
  googleIcon: { color: '#6fe0e6', fontSize: 16, fontWeight: '800' },
  googleTxt: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },

  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  switchTxt: { color: '#4a5568', fontSize: 14 },
  switchLink: { color: '#6fe0e6', fontSize: 14, fontWeight: '600' },
});
