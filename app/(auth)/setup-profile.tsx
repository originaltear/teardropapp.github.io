// Platform-specific: iOS + Android (keyboard avoidance behavior)
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/themes';

// ─── Validation ───────────────────────────────────────────────────────────────

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

function validateUsername(u: string): string | null {
  if (u.length < 3) return 'Minimum 3 characters';
  if (u.length > 20) return 'Maximum 20 characters';
  if (!USERNAME_REGEX.test(u)) return 'Only lowercase letters, numbers and _';
  return null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Visibility = 'everyone' | 'followers' | 'only_me';

const VISIBILITY_OPTS: { value: Visibility; icon: string; label: string; sub: string }[] = [
  { value: 'everyone',  icon: '🌍', label: 'Everyone',    sub: 'Anyone on Teardrop can see your cries' },
  { value: 'followers', icon: '👥', label: 'Friends only', sub: 'Only mutual follows (both follow each other)' },
  { value: 'only_me',   icon: '🔒', label: 'Only me',     sub: 'Completely private — only you can see them' },
];

export default function SetupProfileScreen() {
  const router = useRouter();
  const { refreshUsername } = useAuth();
  const { theme: { accent } } = useTheme();

  const [username, setUsername]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [visibility, setVisibility]   = useState<Visibility>('everyone');
  const [checking, setChecking]       = useState(false);
  const [available, setAvailable]     = useState<boolean | null>(null);
  const [validationErr, setValidationErr] = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Real-time username availability check ─────────────────────────────────

  useEffect(() => {
    setAvailable(null);
    setValidationErr(null);

    if (!username) return;

    const err = validateUsername(username);
    if (err) {
      setValidationErr(err);
      return;
    }

    setChecking(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .rpc('is_username_taken', { uname: username });
      setChecking(false);
      if (!error) setAvailable(!data);
    }, 450);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username]);

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    setError(null);
    const err = validateUsername(username);
    if (err) { setError(err); return; }
    if (!available) { setError('Username is not available.'); return; }

    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); setError('Not logged in.'); return; }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        username: username.toLowerCase().trim(),
        display_name: displayName.trim() || username,
        profile_visibility: visibility,
      })
      .eq('id', session.user.id);

    setSaving(false);

    if (updateErr) {
      if (updateErr.code === '23505') {
        setError('That username was just taken — try another.');
      } else {
        setError(updateErr.message);
      }
      return;
    }

    // Refresh auth context so routing knows username is set
    await refreshUsername();
    router.replace('/(tabs)/');
  }

  // ── Status indicator ──────────────────────────────────────────────────────

  function UsernameStatus() {
    if (!username) return null;
    if (validationErr) return <Text style={s.statusErr}>✕  {validationErr}</Text>;
    if (checking) return <ActivityIndicator size="small" color={accent} style={{ marginTop: 6 }} />;
    if (available === true) return <Text style={s.statusOk}>✓  @{username} is available</Text>;
    if (available === false) return <Text style={s.statusErr}>✕  @{username} is taken</Text>;
    return null;
  }

  const canSave = !saving && !checking && available === true && !validationErr && username.length >= 3;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={s.logoArea}>
            <View style={[s.logoCircle, { backgroundColor: accent, shadowColor: accent }]}>
              <Text style={s.logoEmoji}>💧</Text>
            </View>
            <Text style={s.title}>Set up your profile</Text>
            <Text style={s.sub}>Choose a unique username to get started</Text>
          </View>

          {/* Username */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>USERNAME</Text>
            <View style={s.inputRow}>
              <Text style={[s.atSign, { color: accent }]}>@</Text>
              <TextInput
                style={s.inputInline}
                value={username}
                onChangeText={t => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="yourname"
                placeholderTextColor="#4a5568"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={20}
              />
            </View>
            <UsernameStatus />
            <Text style={s.hint}>3–20 characters · letters, numbers and _ only</Text>
          </View>

          {/* Display name */}
          <View style={[s.fieldGroup, { marginTop: 24 }]}>
            <Text style={s.label}>DISPLAY NAME <Text style={s.optional}>(optional)</Text></Text>
            <TextInput
              style={s.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="How others see your name"
              placeholderTextColor="#4a5568"
              maxLength={40}
            />
          </View>

          {/* Default cry visibility */}
          <View style={[s.fieldGroup, { marginTop: 28 }]}>
            <Text style={s.label}>WHO CAN SEE YOUR CRIES?</Text>
            <Text style={s.hint}>You can change this per cry or in Settings later</Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              {VISIBILITY_OPTS.map(opt => {
                const sel = visibility === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.visRow, sel && { borderColor: accent, backgroundColor: accent + '10' }]}
                    onPress={() => setVisibility(opt.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.visIcon}>{opt.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.visLabel, sel && { color: accent }]}>{opt.label}</Text>
                      <Text style={s.visSub}>{opt.sub}</Text>
                    </View>
                    <View style={[s.visRadio, sel && { borderColor: accent }]}>
                      {sel && <View style={[s.visRadioDot, { backgroundColor: accent }]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {error ? <Text style={s.errorTxt}>{error}</Text> : null}

          {/* Save */}
          <TouchableOpacity
            style={[s.btn, { backgroundColor: accent }, !canSave && s.btnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#0d1117" />
              : <Text style={s.btnTxt}>Continue</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 40, paddingBottom: 40, justifyContent: 'center' },

  logoArea: { alignItems: 'center', marginBottom: 44, gap: 10 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#6fe0e6',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6fe0e6', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 12,
  },
  logoEmoji: { fontSize: 36 },
  title: { color: '#e2e8f0', fontSize: 26, fontWeight: '800' },
  sub: { color: '#4a5568', fontSize: 13, fontFamily: 'monospace', textAlign: 'center' },

  fieldGroup: {},
  label: { color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1.2, marginBottom: 8 },
  optional: { color: '#374151', fontWeight: '400' },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, paddingHorizontal: 14,
  },
  atSign: { color: '#6fe0e6', fontSize: 18, fontWeight: '700', marginRight: 4 },
  inputInline: {
    flex: 1, paddingVertical: 14,
    color: '#e2e8f0', fontSize: 16, fontFamily: 'monospace',
  },
  input: {
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#e2e8f0', fontSize: 15,
  },

  statusOk: { color: '#4ade80', fontSize: 13, marginTop: 6 },
  statusErr: { color: '#ef6f6f', fontSize: 13, marginTop: 6 },
  hint: { color: '#374151', fontSize: 11, fontFamily: 'monospace', marginTop: 6 },

  // Visibility picker
  visRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111827', borderRadius: 12,
    borderWidth: 1, borderColor: '#1f2937',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  visIcon: { fontSize: 22 },
  visLabel: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
  visSub: { color: '#374151', fontSize: 12, marginTop: 1 },
  visRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  visRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6fe0e6' },

  errorTxt: { color: '#ef6f6f', fontSize: 13, marginTop: 16, lineHeight: 18 },

  btn: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 32,
  },
  btnDisabled: { opacity: 0.4 },
  btnTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
});
