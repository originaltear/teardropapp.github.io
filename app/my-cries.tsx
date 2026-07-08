/**
 * Full-screen list of the current user's cries.
 * Navigated to from the Profile tab when tapping "Cries".
 */
import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { loadCries, deleteCry, Cry } from '../lib/storage';
import { emotionById } from '../lib/emotions';
import { useFocusEffect } from 'expo-router';
import { Drops } from '../components/Drops';
import { AudioPlayer } from '../components/AudioPlayer';
import { CryPhoto } from '../components/CryPhoto';
import { timeAgo, fullDateTime } from '../lib/format';
import { warning } from '../lib/haptics';

// ─── Detail sheet ─────────────────────────────────────────────────────────────

function DetailModal({ cry, onClose, onDelete, onEdit }: {
  cry: Cry;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  const emotion = emotionById(cry.emotion);
  const [deleting, setDeleting] = useState(false);

  function confirmDelete() {
    Alert.alert(
      'Delete Cry',
      'This cry will be permanently deleted. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            warning();
            setDeleting(true);
            await deleteCry(cry.id);
            setDeleting(false);
            onDelete(cry.id);
            onClose();
          },
        },
      ]
    );
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.handle} />
        <View style={s.sheetTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity onPress={onEdit} style={s.editBtn} accessibilityRole="button" accessibilityLabel="Edit this cry">
              <Text style={s.editTxt}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} disabled={deleting} style={s.deleteBtn}>
              {deleting
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <Text style={s.deleteTxt}>🗑 Delete</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
          <View style={[s.emotionBadge, { backgroundColor: (emotion?.color ?? '#6fe0e6') + '22' }]}>
            <Text style={{ fontSize: 22 }}>{emotion?.emoji ?? '💧'}</Text>
            <Text style={[s.emotionLabel, { color: emotion?.color ?? '#6fe0e6' }]}>{emotion?.label ?? cry.emotion}</Text>
          </View>
          <Text style={s.dateLabel}>{fullDateTime(cry.createdAt)}</Text>
          <Drops intensity={cry.intensity} />
          {cry.tags && cry.tags.length > 0 && (
            <View style={s.tagsRow}>
              {cry.tags.map(t => <Text key={t} style={s.tagPill}>#{t}</Text>)}
            </View>
          )}
          {cry.photoUri ? <CryPhoto uri={cry.photoUri} style={s.photo} /> : null}
          {cry.note
            ? <View style={s.noteBox}><Text style={s.noteText}>{cry.note}</Text></View>
            : <Text style={s.noNote}>No note</Text>}
          {cry.audioUri ? <AudioPlayer uri={cry.audioUri} /> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MyCriesScreen() {
  const router = useRouter();
  const [cries, setCries] = useState<Cry[]>([]);
  const [selected, setSelected] = useState<Cry | null>(null);

  useFocusEffect(useCallback(() => { loadCries().then(setCries); }, []));

  function handleDelete(id: string) {
    setCries(prev => prev.filter(c => c.id !== id));
    setSelected(null);
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>My Cries</Text>
        <Text style={s.count}>{cries.length}</Text>
      </View>

      <FlatList
        data={cries}
        keyExtractor={c => c.id}
        renderItem={({ item: cry }) => {
          const emotion = emotionById(cry.emotion);
          const color = emotion?.color ?? '#6fe0e6';
          return (
            <TouchableOpacity style={s.row} onPress={() => setSelected(cry)} activeOpacity={0.75}>
              <View style={[s.dot, { backgroundColor: color }]}>
                <Text style={{ fontSize: 20 }}>{emotion?.emoji ?? '💧'}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[s.emotionName, { color }]}>{emotion?.label ?? cry.emotion}</Text>
                  <Text style={s.time}>{timeAgo(cry.createdAt)}</Text>
                </View>
                <Drops intensity={cry.intensity} />
                {cry.note ? <Text style={s.noteSnippet} numberOfLines={1}>{cry.note}</Text> : null}
                {(cry.photoUri || cry.audioUri) ? (
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {cry.photoUri ? <Text style={{ fontSize: 11 }}>📷</Text> : null}
                    {cry.audioUri ? <Text style={{ fontSize: 11 }}>🎙</Text> : null}
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        contentContainerStyle={cries.length === 0 ? s.emptyWrap : undefined}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 48, opacity: 0.3 }}>💧</Text>
            <Text style={s.emptyTxt}>No cries yet</Text>
            <Text style={s.emptySub}>Go to the Map tab and tap + to log your first cry.</Text>
          </View>
        }
      />

      {selected && (
        <DetailModal
          cry={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onEdit={() => {
            const id = selected.id;
            setSelected(null);
            router.push(`/log-cry?editId=${id}`);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#6fe0e6', fontSize: 22 },
  title: { flex: 1, color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  count: { color: '#4a5568', fontSize: 14, fontFamily: 'monospace' },

  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  dot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emotionName: { fontSize: 15, fontWeight: '600' },
  time: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace' },
  noteSnippet: { color: '#64748b', fontSize: 13 },
  sep: { height: 1, backgroundColor: '#1f2937', marginLeft: 72 },

  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTxt: { color: '#4a5568', fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#374151', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#111827', maxHeight: '90%',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#1f2937',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', alignSelf: 'center', marginTop: 12 },
  sheetTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  closeTxt: { color: '#4a5568', fontSize: 18 },
  deleteBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  deleteTxt: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  editBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  editTxt: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagPill: {
    color: '#94a3b8', fontSize: 12, fontWeight: '500',
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    overflow: 'hidden',
  },
  emotionBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start' },
  emotionLabel: { fontSize: 17, fontWeight: '700' },
  dateLabel: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace' },
  photo: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#0d1117' },
  noteBox: { backgroundColor: '#0d1117', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1f2937' },
  noteText: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  noNote: { color: '#374151', fontSize: 13, fontFamily: 'monospace' },
  audioBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0d1117', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#6fe0e6' },
  audioIcon: { fontSize: 16, color: '#6fe0e6' },
  audioTxt: { color: '#6fe0e6', fontSize: 14, fontWeight: '500' },
});
