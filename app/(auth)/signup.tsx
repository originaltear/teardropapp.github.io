import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  async function handleSignup() {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError('Please enter your email.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: {
        data: { display_name: trimmed.split('@')[0] },
      },
    });
    setLoading(false);

    if (error) { setError(error.message); return; }

    if (data.session) {
      // Email confirmation disabled — logged in immediately
      // RootNav listener handles navigation
    } else {
      // Email confirmation required
      setEmailSent(true);
    }
  }

  if (emailSent) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.confirmedArea}>
          <Text style={styles.confirmedEmoji}>✉️</Text>
          <Text style={styles.confirmedTitle}>Check your email</Text>
          <Text style={styles.confirmedSub}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.confirmedEmail}>{email.trim()}</Text>
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.8}
          >
            <Text style={styles.backBtnTxt}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
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
          {/* Back button */}
          <TouchableOpacity
            style={styles.backRow}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.backArrow}>← </Text>
            <Text style={styles.backTxt}>Log in</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.sub}>Start logging your emotional journey</Text>
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
              placeholder="At least 6 characters"
              placeholderTextColor="#4a5568"
              secureTextEntry
              textContentType="newPassword"
              onSubmitEditing={handleSignup}
              returnKeyType="done"
            />

            {error ? <Text style={styles.errorTxt}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#0d1117" />
                : <Text style={styles.btnTxt}>Create account</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.switchRow}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.7}
          >
            <Text style={styles.switchTxt}>Already have an account? </Text>
            <Text style={styles.switchLink}>Log in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 16, paddingBottom: 32 },

  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  backArrow: { color: '#6fe0e6', fontSize: 18 },
  backTxt: { color: '#6fe0e6', fontSize: 15, fontWeight: '600' },

  header: { marginBottom: 36, gap: 6 },
  title: { color: '#e2e8f0', fontSize: 28, fontWeight: '800' },
  sub: { color: '#4a5568', fontSize: 14, fontFamily: 'monospace' },

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

  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  switchTxt: { color: '#4a5568', fontSize: 14 },
  switchLink: { color: '#6fe0e6', fontSize: 14, fontWeight: '600' },

  // Email confirmation screen
  confirmedArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  confirmedEmoji: { fontSize: 56 },
  confirmedTitle: { color: '#e2e8f0', fontSize: 22, fontWeight: '700' },
  confirmedSub: { color: '#4a5568', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  confirmedEmail: { color: '#6fe0e6', fontWeight: '600' },
  backBtn: {
    marginTop: 8, backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32,
  },
  backBtnTxt: { color: '#0d1117', fontSize: 15, fontWeight: '700' },
});
