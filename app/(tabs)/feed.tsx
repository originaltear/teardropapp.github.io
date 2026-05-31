import { useCallback, useRef, useState } from 'react';
import {
  StyleSheet, View, Text, FlatList,
  TouchableOpacity, Modal, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { loadCries, Cry } from '../../lib/storage';
import { emotionById } from '../../lib/emotions';
import { useAuth } from '../../lib/auth';
import { AuthGateModal } from '../../components/AuthGateModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFullDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

function Drops({ intensity, size = 14 }: { intensity: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: size, opacity: n <= intensity ? 1 : 0.2 }}>💧</Text>
      ))}
    </View>
  );
}

// ─── Audio player hook (per-modal instance) ───────────────────────────────────

function AudioPlayer({ uri }: { uri: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  async function toggle() {
    if (playing) {
      await soundRef.current?.stopAsync();
      setPlaying(false);
      return;
    }
    try {
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate(s => {
        if (s.isLoaded && s.didJustFinish) {
          setPlaying(false);
          sound.unloadAsync();
        }
      });
      await sound.playAsync();
    } catch {
      Alert.alert('Error', 'Could not play audio.');
    }
  }

  return (
    <TouchableOpacity style={styles.audioPlayer} onPress={toggle} activeOpacity={0.8}>
      <Text style={styles.audioIcon}>{playing ? '⏹' : '▶'}</Text>
      <Text style={styles.audioLabel}>{playing ? 'Stop voice note' : 'Play voice note'}</Text>
    </TouchableOpacity>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({ cry, onClose }: { cry: Cry; onClose: () => void }) {
  const emotion = emotionById(cry.emotion);
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <View style={[styles.emotionBadge, { backgroundColor: (emotion?.color ?? '#6fe0e6') + '22' }]}>
            <Text style={styles.badgeEmoji}>{emotion?.emoji ?? '💧'}</Text>
            <Text style={[styles.badgeLabel, { color: emotion?.color ?? '#6fe0e6' }]}>
              {emotion?.label ?? cry.emotion}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sheetDate}>{formatFullDate(cry.createdAt)}</Text>
        <Drops intensity={cry.intensity} size={20} />

        {/* Photo */}
        {cry.photoUri ? (
          <Image source={{ uri: cry.photoUri }} style={styles.photo} resizeMode="cover" />
        ) : null}

        {/* Note */}
        {cry.note ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>{cry.note}</Text>
          </View>
        ) : (
          <Text style={styles.noNote}>No note</Text>
        )}

        {/* Audio */}
        {cry.audioUri ? <AudioPlayer uri={cry.audioUri} /> : null}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Feed item ────────────────────────────────────────────────────────────────

function FeedItem({ cry, onPress }: { cry: Cry; onPress: () => void }) {
  const emotion = emotionById(cry.emotion);
  const color = emotion?.color ?? '#6fe0e6';

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.75}>
      {/* Left: emotion dot */}
      <View style={[styles.dot, { backgroundColor: color }]}>
        <Text style={styles.dotEmoji}>{emotion?.emoji ?? '💧'}</Text>
      </View>

      {/* Right: content */}
      <View style={styles.itemContent}>
        <View style={styles.itemTop}>
          <Text style={[styles.emotionName, { color }]}>{emotion?.label ?? cry.emotion}</Text>
          <Text style={styles.timeAgo}>{formatDate(cry.createdAt)}</Text>
        </View>
        <Drops intensity={cry.intensity} size={13} />
        {cry.note ? (
          <Text style={styles.noteSnippet} numberOfLines={2}>{cry.note}</Text>
        ) : null}
        {/* Media indicators */}
        {(cry.photoUri || cry.audioUri) ? (
          <View style={styles.mediaIndicators}>
            {cry.photoUri ? <Text style={styles.mediaTag}>📷</Text> : null}
            {cry.audioUri ? <Text style={styles.mediaTag}>🎙</Text> : null}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Feed screen ──────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { session } = useAuth();
  const [cries, setCries] = useState<Cry[]>([]);
  const [selected, setSelected] = useState<Cry | null>(null);
  const [authGate, setAuthGate] = useState(false);

  useFocusEffect(
    useCallback(() => { loadCries().then(setCries); }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <TouchableOpacity
          style={styles.addFriendsBtn}
          activeOpacity={0.7}
          onPress={() => session ? undefined : setAuthGate(true)}
        >
          <Text style={styles.addFriendsTxt}>Add Friends</Text>
        </TouchableOpacity>
      </View>

      <AuthGateModal visible={authGate} onClose={() => setAuthGate(false)} />

      <FlatList
        data={cries}
        keyExtractor={c => c.id}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <FeedItem cry={item} onPress={() => setSelected(item)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={cries.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💧</Text>
            <Text style={styles.emptyTitle}>No cries yet</Text>
            <Text style={styles.emptySub}>
              Go to the Map tab and tap + to log your first cry.
            </Text>
          </View>
        }
      />

      {selected && (
        <DetailModal cry={selected} onClose={() => setSelected(null)} />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerTitle: {
    color: '#e2e8f0',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  addFriendsBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
    opacity: 0.5,
  },
  addFriendsTxt: {
    color: '#6fe0e6',
    fontSize: 13,
    fontWeight: '600',
  },

  listContent: { paddingVertical: 8 },
  separator: { height: 1, backgroundColor: '#1f2937', marginLeft: 72 },

  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  dot: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  dotEmoji: { fontSize: 22 },
  itemContent: { flex: 1, gap: 5 },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emotionName: { fontSize: 15, fontWeight: '600' },
  timeAgo: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace' },
  noteSnippet: { color: '#64748b', fontSize: 13, lineHeight: 18, marginTop: 2 },
  mediaIndicators: { flexDirection: 'row', gap: 4, marginTop: 2 },
  mediaTag: { fontSize: 12 },

  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, opacity: 0.4 },
  emptyTitle: { color: '#4a5568', fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#374151', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Detail sheet
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingTop: 12,
    borderTopWidth: 1, borderColor: '#1f2937',
    gap: 14,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#374151', alignSelf: 'center', marginBottom: 4,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emotionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  badgeEmoji: { fontSize: 20 },
  badgeLabel: { fontSize: 16, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#4a5568', fontSize: 18 },
  sheetDate: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace' },
  photo: {
    width: '100%', height: 180, borderRadius: 12,
    backgroundColor: '#0d1117',
  },
  noteBox: {
    backgroundColor: '#0d1117', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#1f2937',
  },
  noteText: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  noNote: { color: '#374151', fontSize: 13, fontFamily: 'monospace' },
  audioPlayer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0d1117', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#6fe0e6',
  },
  audioIcon: { fontSize: 18, color: '#6fe0e6' },
  audioLabel: { color: '#6fe0e6', fontSize: 14, fontWeight: '500' },
});
