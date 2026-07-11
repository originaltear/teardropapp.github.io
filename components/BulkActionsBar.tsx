/**
 * Bulk-edit action bar + prompts, shared by My Cries and the feed's Mine tab.
 * The screens own the selection state and the post-apply list updates; this
 * module owns the bar UI and the two confirmation dialogs.
 */
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import type { Cry } from '../lib/storage';

export type CryVisibility = NonNullable<Cry['visibility']>;

export const CRY_VISIBILITY_OPTIONS: { value: CryVisibility; label: string }[] = [
  { value: 'everyone',      label: '🌍 Everyone' },
  { value: 'followers',     label: '👥 Friends' },
  { value: 'close_friends', label: '🔒 Close friends' },
  { value: 'only_me',       label: '🫥 Only me' },
];

export function visibilityLabel(v: CryVisibility): string {
  return CRY_VISIBILITY_OPTIONS.find(o => o.value === v)?.label ?? v;
}

/** "Who can see these cries?" picker → onPick with the chosen level. */
export function promptBulkVisibility(count: number, onPick: (v: CryVisibility) => void) {
  Alert.alert(
    'Who can see these cries?',
    `${count} ${count === 1 ? 'cry' : 'cries'} selected`,
    [
      ...CRY_VISIBILITY_OPTIONS.map(opt => ({
        text: opt.label,
        onPress: () => onPick(opt.value),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ],
  );
}

/** Destructive confirm for bulk delete. */
export function promptBulkDelete(count: number, onConfirm: () => void) {
  Alert.alert(
    `Delete ${count} ${count === 1 ? 'cry' : 'cries'}?`,
    'They will be permanently deleted. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ],
  );
}

export function BulkActionsBar({ count, applying, onChangeVisibility, onDelete }: {
  count: number;
  applying: boolean;
  onChangeVisibility: () => void;
  onDelete: () => void;
}) {
  const disabled = count === 0 || applying;
  return (
    <View style={s.bar}>
      <Text style={s.count}>
        {count} {count === 1 ? 'cry' : 'cries'}
      </Text>
      <TouchableOpacity
        style={[s.deleteBtn, disabled && { opacity: 0.4 }]}
        onPress={onDelete}
        disabled={disabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Delete selected cries"
      >
        <Text style={s.deleteTxt}>🗑 Delete</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.visBtn, disabled && { opacity: 0.4 }]}
        onPress={onChangeVisibility}
        disabled={disabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Change visibility of selected cries"
      >
        {applying
          ? <ActivityIndicator size="small" color="#0d1117" />
          : <Text style={s.visTxt}>🔒 Visibility</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#1f2937', backgroundColor: '#111827',
  },
  count: { flex: 1, color: '#94a3b8', fontSize: 13, fontFamily: 'monospace' },
  deleteBtn: {
    borderWidth: 1, borderColor: '#ef4444', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  deleteTxt: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  visBtn: {
    backgroundColor: '#6fe0e6', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    minWidth: 120, alignItems: 'center',
  },
  visTxt: { color: '#0d1117', fontSize: 14, fontWeight: '700' },
});
