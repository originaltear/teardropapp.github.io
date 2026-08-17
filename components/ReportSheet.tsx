/**
 * ReportSheet — the one report flow, shared by cries, comments and profiles.
 *
 * Replaces three separate Alert.alert() category lists. Those could not take
 * text, which meant a report arrived saying only "Harassment" and someone had
 * to go hunting through the database for what was actually wrong.
 *
 * Shape follows what the large social apps settled on:
 *  - a category, for sorting
 *  - a free-text box, optional, because demanding an essay stops people
 *    reporting at all
 *  - an offer to block straight after, since that is usually the thing the
 *    person actually wanted
 *
 * Entry points must be labelled "Report" in a menu. A bare icon that reports on
 * tap is the mistake Apple calls out by name under Guideline 1.2.
 */
import { useState } from 'react';
import {
  View, Text, Modal, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTheme } from '../lib/themes';
import { reportContent, blockUser, ReportTarget } from '../lib/social';
import { selection } from '../lib/haptics';

const REASONS = [
  'Harassment or bullying',
  'Hate or slurs',
  'Sexual content',
  'Violence or self-harm',
  'Spam or scam',
  'Something else',
];

export function ReportSheet({
  visible, onClose, target, targetId, authorId, authorUsername,
}: {
  visible: boolean;
  onClose: () => void;
  target: ReportTarget;
  targetId: string;
  /** Who posted it, so blocking can be offered afterwards. */
  authorId?: string | null;
  authorUsername?: string | null;
}) {
  const { theme: { accent } } = useTheme();
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);

  const label = target === 'user' ? 'account' : target === 'comment' ? 'comment' : 'cry';

  function reset() {
    setReason(null);
    setDetail('');
    setSending(false);
  }

  function close() {
    reset();
    onClose();
  }

  function offerBlock() {
    if (!authorId || !authorUsername) return;
    Alert.alert(
      'Block this person too?',
      `@${authorUsername} won't be able to see you or reach you, and they disappear from your feed and the map. You can undo this in Settings.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            await blockUser(authorId);
            Alert.alert('Blocked', `You won't see @${authorUsername} again.`);
          },
        },
      ],
    );
  }

  async function submit() {
    if (!reason) return;
    setSending(true);
    // The category leads so reports stay sortable; the description is what
    // makes a report actionable without going digging.
    const body = detail.trim() ? `${reason}: ${detail.trim()}` : reason;
    const result = await reportContent(target, targetId, body);
    setSending(false);

    if (result === 'ok') {
      close();
      Alert.alert(
        'Report sent',
        'Thanks. Reports are reviewed within 24 hours, and content that breaks the guidelines is removed along with the account behind it.',
        [{ text: 'OK', onPress: offerBlock }],
      );
    } else if (result === 'duplicate') {
      close();
      Alert.alert('Already reported', `You've already reported this ${label}.`);
    } else {
      Alert.alert('Could not send', 'Please try again.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={s.root}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
        <KeyboardAvoidingView behavior="padding" automaticOffset>
          <SafeAreaView edges={['bottom']}>
            <View style={s.sheet}>
              <View style={s.handle} />
              <View style={s.headerRow}>
                <Text style={s.title}>Report this {label}</Text>
                <TouchableOpacity onPress={close} hitSlop={8}>
                  <Text style={s.close}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.hint}>What's wrong with it?</Text>
              <View style={s.reasons}>
                {REASONS.map(r => {
                  const on = reason === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[s.chip, on && { borderColor: accent, backgroundColor: accent + '18' }]}
                      onPress={() => { selection(); setReason(r); }}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[s.chipTxt, on && { color: accent }]}>{r}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                style={s.input}
                value={detail}
                onChangeText={setDetail}
                placeholder="Add anything that helps us find it (optional)"
                placeholderTextColor="#4a5568"
                multiline
                maxLength={1000}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[s.submit, (!reason || sending) && { opacity: 0.4 }]}
                onPress={submit}
                disabled={!reason || sending}
                activeOpacity={0.85}
              >
                {sending
                  ? <ActivityIndicator color="#0d1117" />
                  : <Text style={s.submitTxt}>Send report</Text>}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#00000099' },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151',
    alignSelf: 'center', marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6,
  },
  title: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },
  close: { color: '#4a5568', fontSize: 17, padding: 4 },
  hint: { color: '#4a5568', fontSize: 13, marginBottom: 12 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937',
  },
  chipTxt: { color: '#94a3b8', fontSize: 13 },
  input: {
    backgroundColor: '#0d1117', borderRadius: 12, borderWidth: 1, borderColor: '#1f2937',
    color: '#e2e8f0', fontSize: 15, padding: 12, minHeight: 84, marginBottom: 14,
  },
  submit: {
    backgroundColor: '#ef4444', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  submitTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
