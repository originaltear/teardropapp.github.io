/**
 * AuthGateModal
 *
 * Shows a bottom sheet asking the user to sign up or log in
 * before accessing social features. Appears when a guest taps
 * something that requires an account (Add Friends, likes, etc.).
 */
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AuthGateModal({ visible, onClose }: Props) {
  const router = useRouter();

  function go(path: '/(auth)/login' | '/(auth)/signup') {
    onClose();
    router.push(path);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <Text style={s.emoji}>👥</Text>
        <Text style={s.title}>Connect with others</Text>
        <Text style={s.sub}>
          Create an account or log in to add friends, see their cries, and more.
        </Text>

        <TouchableOpacity style={s.signupBtn} onPress={() => go('/(auth)/signup')} activeOpacity={0.85}>
          <Text style={s.signupTxt}>Sign Up</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.loginBtn} onPress={() => go('/(auth)/login')} activeOpacity={0.85}>
          <Text style={s.loginTxt}>Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={s.cancelTxt}>Not now</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingTop: 16, paddingBottom: 36,
    alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderColor: '#1f2937',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#374151', marginBottom: 8,
  },
  emoji: { fontSize: 40, marginBottom: 4 },
  title: { color: '#e2e8f0', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub: { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },

  signupBtn: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 48,
    alignItems: 'center', marginTop: 8, width: '100%',
  },
  signupTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },

  loginBtn: {
    backgroundColor: 'transparent', borderRadius: 14, borderWidth: 1, borderColor: '#1f2937',
    paddingVertical: 14, paddingHorizontal: 48,
    alignItems: 'center', width: '100%',
  },
  loginTxt: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },

  cancelBtn: { paddingVertical: 8 },
  cancelTxt: { color: '#374151', fontSize: 13 },
});
