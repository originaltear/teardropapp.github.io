import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Platform,
  ActivityIndicator, ScrollView, Animated,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../../lib/supabase';
import { runOAuth, friendlyOAuthError } from '../../lib/oauth';
import { signInWithApple } from '../../lib/apple-auth';
import { useTheme } from '../../lib/themes';
import { PressableScale } from '../../components/PressableScale';

WebBrowser.maybeCompleteAuthSession();

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | null>(null);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Gentle fade + rise of the logo when the screen first appears.
  const intro = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [intro]);

  // ── Email / password ──────────────────────────────────────────────────────

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
    if (error) setError(error.message);
    // On success → AuthProvider triggers sync + RootNav redirects automatically
  }

  // ── OAuth ─────────────────────────────────────────────────────────────────

  async function handleOAuth(provider: 'google') {
    setError(null);
    setOauthLoading(provider);
    try {
      await runOAuth(provider);
    } catch (err) {
      setError(friendlyOAuthError(err));
    } finally {
      setOauthLoading(null);
    }
  }

  // ── Sign in with Apple (iOS) ────────────────────────────────────────────────

  async function handleApple() {
    setError(null);
    setAppleLoading(true);
    const result = await signInWithApple();
    setAppleLoading(false);
    if (result === 'error') {
      setError('Apple sign-in failed. Please try again or use your email.');
    }
    // 'success' → AuthProvider redirects automatically; 'cancelled' → no-op
  }

  // ── Continue as guest ─────────────────────────────────────────────────────

  function handleGuest() {
    router.replace('/(tabs)/');
  }

  const anyOAuthLoading = oauthLoading !== null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        automaticOffset
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <Animated.View style={[styles.logoArea, {
            opacity: intro,
            transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          }]}>
            <View style={[styles.logoCircle, { backgroundColor: accent, shadowColor: accent }]}>
              <Text style={styles.logoEmoji}>💧</Text>
            </View>
            <Text style={styles.appName}>Teardrop</Text>
            <Text style={styles.tagline}>Your emotional atlas</Text>
          </Animated.View>

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
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#4a5568"
                secureTextEntry={!showPassword}
                textContentType="password"
                onSubmitEditing={handleLogin}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={styles.revealBtn}
                onPress={() => setShowPassword(v => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.revealTxt, { color: accent }]}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorTxt}>{error}</Text> : null}

            <PressableScale
              style={[styles.primaryBtn, { backgroundColor: accent }, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#0d1117" />
                : <Text style={styles.primaryBtnTxt}>Log in</Text>}
            </PressableScale>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerTxt}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Third-party login — Sign in with Apple on iOS (Guideline 4.8),
                Google on Android. */}
            {Platform.OS === 'ios' ? (
              appleLoading ? (
                <View style={styles.appleBtnLoading}>
                  <ActivityIndicator color="#0d1117" />
                </View>
              ) : (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={14}
                  style={styles.appleBtn}
                  onPress={handleApple}
                />
              )
            ) : (
              <OAuthButton
                label="Continue with Google"
                icon="G"
                iconColor={accent}
                loading={oauthLoading === 'google'}
                disabled={anyOAuthLoading || loading}
                onPress={() => handleOAuth('google')}
              />
            )}
          </View>

          {/* Sign-up link */}
          <TouchableOpacity
            style={styles.switchRow}
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.7}
          >
            <Text style={styles.switchTxt}>Don't have an account? </Text>
            <Text style={[styles.switchLink, { color: accent }]}>Sign up</Text>
          </TouchableOpacity>

          {/* Guest */}
          <TouchableOpacity
            style={styles.guestBtn}
            onPress={handleGuest}
            activeOpacity={0.6}
          >
            <Text style={styles.guestTxt}>Continue without account</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Reusable OAuth button ────────────────────────────────────────────────────

function OAuthButton({ label, icon, iconColor, loading, disabled, onPress }: {
  label: string; icon: string; iconColor: string;
  loading: boolean; disabled: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.oauthBtn, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {loading
        ? <ActivityIndicator color="#e2e8f0" />
        : <>
            <Text style={[styles.oauthIcon, { color: iconColor }]}>{icon}</Text>
            <Text style={styles.oauthTxt}>{label}</Text>
          </>}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 32, justifyContent: 'center' },

  logoArea: { alignItems: 'center', marginBottom: 44, gap: 8 },
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
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: 68 },
  revealBtn: {
    position: 'absolute', right: 6, top: 0, bottom: 0,
    paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center',
  },
  revealTxt: { fontSize: 13, fontWeight: '600' },
  errorTxt: { color: '#ef6f6f', fontSize: 13, marginTop: 8, lineHeight: 18 },

  primaryBtn: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 24,
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#1f2937' },
  dividerTxt: { color: '#374151', fontSize: 12, fontFamily: 'monospace' },

  oauthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 14, paddingVertical: 14,
  },
  oauthIcon: { fontSize: 16, fontWeight: '800', width: 20, textAlign: 'center' },
  oauthTxt: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },

  appleBtn: { width: '100%', height: 50 },
  appleBtnLoading: {
    width: '100%', height: 50, borderRadius: 14, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },

  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  switchTxt: { color: '#4a5568', fontSize: 14 },
  switchLink: { color: '#6fe0e6', fontSize: 14, fontWeight: '600' },

  guestBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 8 },
  guestTxt: { color: '#374151', fontSize: 13, textDecorationLine: 'underline' },
});
