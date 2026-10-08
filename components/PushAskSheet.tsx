/**
 * The explainer shown before the system notification dialog.
 *
 * It says what a notification from Teardrop would be about, so the system
 * dialog that follows a yes is answered knowing that. A "Not now" here leaves
 * the system dialog unused for a later ask (see lib/push-ask.ts).
 */
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import { UiIcon } from './UiIcon';

export function PushAskSheet({ visible, onAllow, onLater }: {
  visible: boolean;
  onAllow: () => void;
  onLater: () => void;
}) {
  const { width } = useWindowDimensions();
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onLater}>
      <View style={s.backdrop}>
        <View style={[s.card, { width: Math.min(width - 48, 420) }]}>
          <UiIcon name="heartHandshake" size={40} color="#6fe0e6" />
          <Text style={s.title}>Want to know when a friend sends you a hug?</Text>
          <Text style={s.body}>
            Teardrop lets you know when someone reacts to your cries or a friend shares one.
            You can change it anytime in Settings.
          </Text>
          <TouchableOpacity
            style={s.btn}
            onPress={onAllow}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={s.btnTxt}>Turn on notifications</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onLater} hitSlop={10} accessibilityRole="button">
            <Text style={s.later}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 24, borderWidth: 1, borderColor: '#1f2937',
    alignItems: 'center', padding: 28, gap: 12,
  },
  title: {
    color: '#e2e8f0', fontSize: 20, fontWeight: '700',
    textAlign: 'center', lineHeight: 26, marginTop: 4,
  },
  body: { color: '#94a3b8', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  btn: {
    marginTop: 8, alignSelf: 'stretch', alignItems: 'center',
    backgroundColor: '#6fe0e6', borderRadius: 14, paddingVertical: 13,
  },
  btnTxt: { color: '#0d1117', fontSize: 17, fontWeight: '700' },
  later: { color: '#94a3b8', fontSize: 15, fontWeight: '600', paddingVertical: 6 },
});
