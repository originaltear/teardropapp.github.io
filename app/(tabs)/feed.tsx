import { useCallback, useRef, useState } from 'react';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity,
  Modal, Image, Alert, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
// Note: TextInput + ScrollView used in DetailModal comment section
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { emotionById, EMOTIONS, Emotion } from '../../lib/emotions';
import { useAuth } from '../../lib/auth';
import { AuthGateModal } from '../../components/AuthGateModal';
import {
  getSocialFeed, getMapCries, likeCry, unlikeCry, getComments, addComment,
  SocialCry, Comment,
} from '../../lib/social';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso), now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatFullDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function Drops({ intensity, size = 14 }: { intensity: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <Text key={n} style={{ fontSize: size, opacity: n <= intensity ? 1 : 0.2 }}>💧</Text>
      ))}
    </View>
  );
}

function Avatar({ uri, size = 36 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.45 }}>💧</Text>
    </View>
  );
}

// ─── Audio player ─────────────────────────────────────────────────────────────

function AudioPlayer({ uri }: { uri: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  async function toggle() {
    if (playing) { await soundRef.current?.stopAsync(); setPlaying(false); return; }
    try {
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate(s => { if (s.isLoaded && s.didJustFinish) { setPlaying(false); sound.unloadAsync(); } });
      await sound.playAsync();
    } catch { Alert.alert('Error', 'Could not play audio.'); }
  }
  return (
    <TouchableOpacity style={styles.audioPlayer} onPress={toggle} activeOpacity={0.8}>
      <Text style={styles.audioIcon}>{playing ? '⏹' : '▶'}</Text>
      <Text style={styles.audioLabel}>{playing ? 'Stop voice note' : 'Play voice note'}</Text>
    </TouchableOpacity>
  );
}

// ─── Detail modal with likes + comments ───────────────────────────────────────

function DetailModal({ cry, myId, onClose, onLikeToggle }: {
  cry: SocialCry;
  myId: string | null;
  onClose: () => void;
  onLikeToggle: (cryId: string, liked: boolean) => void;
}) {
  const emotion = emotionById(cry.emotion);
  const [liked, setLiked] = useState(cry.liked_by_me);
  const [likeCount, setLikeCount] = useState(cry.like_count);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const isOwn = myId === cry.user_id;

  useFocusEffect(useCallback(() => {
    getComments(cry.id).then(c => { setComments(c); setLoadingComments(false); });
  }, [cry.id]));

  async function toggleLike() {
    if (!myId) return;
    const next = !liked;
    setLiked(next);
    setLikeCount(c => c + (next ? 1 : -1));
    onLikeToggle(cry.id, next);
    if (next) await likeCry(cry.id); else await unlikeCry(cry.id);
  }

  async function submitComment() {
    if (!commentText.trim() || !myId) return;
    setPosting(true);
    const c = await addComment(cry.id, commentText.trim());
    if (c) setComments(prev => [...prev, c]);
    setCommentText('');
    setPosting(false);
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kvSheet}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar uri={cry.profile.avatar_uri} size={32} />
              <View>
                <Text style={styles.sheetUser}>{cry.profile.display_name}</Text>
                <Text style={styles.sheetHandle}>@{cry.profile.username}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Emotion + drops */}
            <View style={[styles.emotionBadge, { backgroundColor: (emotion?.color ?? '#6fe0e6') + '22', alignSelf: 'flex-start', marginTop: 8 }]}>
              <Text style={styles.badgeEmoji}>{emotion?.emoji ?? '💧'}</Text>
              <Text style={[styles.badgeLabel, { color: emotion?.color ?? '#6fe0e6' }]}>{emotion?.label ?? cry.emotion}</Text>
            </View>
            <Text style={styles.sheetDate}>{formatFullDate(cry.created_at)}</Text>
            <Drops intensity={cry.intensity} size={18} />
            {cry.photo_uri ? <Image source={{ uri: cry.photo_uri }} style={styles.photo} resizeMode="cover" /> : null}
            {cry.note ? <View style={styles.noteBox}><Text style={styles.noteText}>{cry.note}</Text></View> : null}
            {cry.audio_uri ? <AudioPlayer uri={cry.audio_uri} /> : null}

            {/* Like button */}
            <View style={styles.likeRow}>
              {!isOwn && myId && (
                <TouchableOpacity style={styles.likeBtn} onPress={toggleLike} activeOpacity={0.75}>
                  <Text style={styles.likeIcon}>{liked ? '💧' : '🤍'}</Text>
                  <Text style={[styles.likeTxt, liked && styles.likeTxtActive]}>
                    {liked ? 'Liked' : 'Like'}
                  </Text>
                </TouchableOpacity>
              )}
              {likeCount > 0 && (
                <Text style={styles.likeCount}>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</Text>
              )}
            </View>

            {/* Comments */}
            <Text style={styles.commentsHeader}>Comments</Text>
            {loadingComments
              ? <ActivityIndicator color="#6fe0e6" style={{ marginVertical: 12 }} />
              : comments.length === 0
                ? <Text style={styles.noComments}>No comments yet</Text>
                : comments.map(c => (
                  <View key={c.id} style={styles.commentRow}>
                    <Avatar uri={c.profile.avatar_uri} size={28} />
                    <View style={styles.commentBubble}>
                      <Text style={styles.commentUser}>{c.profile.display_name}</Text>
                      <Text style={styles.commentText}>{c.content}</Text>
                    </View>
                  </View>
                ))
            }
            <View style={{ height: 80 }} />
          </ScrollView>

          {/* Comment input */}
          {myId && (
            <View style={styles.commentInput}>
              <TextInput
                style={styles.commentField}
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment…"
                placeholderTextColor="#4a5568"
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!commentText.trim() || posting) && { opacity: 0.4 }]}
                onPress={submitComment}
                disabled={!commentText.trim() || posting}
              >
                {posting ? <ActivityIndicator size="small" color="#0d1117" /> : <Text style={styles.sendTxt}>↑</Text>}
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Feed item ────────────────────────────────────────────────────────────────

function FeedItem({ cry, onPress }: { cry: SocialCry; onPress: () => void }) {
  const emotion = emotionById(cry.emotion);
  const color = emotion?.color ?? '#6fe0e6';
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.75}>
      <Avatar uri={cry.profile.avatar_uri} size={44} />
      <View style={styles.itemContent}>
        <View style={styles.itemTop}>
          <Text style={styles.itemUser}>{cry.profile.display_name}
            <Text style={styles.itemHandle}> @{cry.profile.username}</Text>
          </Text>
          <Text style={styles.timeAgo}>{formatDate(cry.created_at)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <Text style={[styles.emotionChip, { color, backgroundColor: color + '22' }]}>
            {emotion?.emoji} {emotion?.label ?? cry.emotion}
          </Text>
          <Drops intensity={cry.intensity} size={11} />
        </View>
        {cry.note ? <Text style={styles.noteSnippet} numberOfLines={2}>{cry.note}</Text> : null}
        <View style={styles.itemMeta}>
          {(cry.photo_uri || cry.audio_uri) ? (
            <>
              {cry.photo_uri ? <Text style={styles.metaTag}>📷</Text> : null}
              {cry.audio_uri ? <Text style={styles.metaTag}>🎙</Text> : null}
            </>
          ) : null}
          {cry.like_count > 0 && <Text style={styles.metaTag}>💧 {cry.like_count}</Text>}
          {cry.comment_count > 0 && <Text style={styles.metaTag}>💬 {cry.comment_count}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Feed screen ──────────────────────────────────────────────────────────────

type FeedTab = 'mine' | 'following';

export default function FeedScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [allCries, setAllCries] = useState<SocialCry[]>([]);
  const [selected, setSelected] = useState<SocialCry | null>(null);
  const [authGate, setAuthGate] = useState(false);
  const [tab, setTab] = useState<FeedTab>('following');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Mine tab filters
  const [mineEmotion, setMineEmotion] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  async function loadFeed(isRefresh = false) {
    if (!session) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    const loader = tab === 'mine' ? getMapCries('mine') : getSocialFeed();
    const feed = await loader;
    setAllCries(feed);
    isRefresh ? setRefreshing(false) : setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    loadFeed();
  }, [session, tab]));

  // Filter mine tab by emotion
  const displayCries = tab === 'mine' && mineEmotion
    ? allCries.filter(c => c.emotion === mineEmotion)
    : allCries;

  const selectedEmotion = mineEmotion ? EMOTIONS.find(e => e.id === mineEmotion) : null;

  function handleLikeToggle(cryId: string, liked: boolean) {
    setAllCries(prev => prev.map(c => c.id === cryId
      ? { ...c, liked_by_me: liked, like_count: c.like_count + (liked ? 1 : -1) }
      : c
    ));
    if (selected?.id === cryId) {
      setSelected(prev => prev ? { ...prev, liked_by_me: liked, like_count: prev.like_count + (liked ? 1 : -1) } : null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <TouchableOpacity
          style={styles.addFriendsBtn}
          activeOpacity={0.7}
          onPress={() => session ? router.push('/friends') : setAuthGate(true)}
        >
          <Text style={styles.addFriendsTxt}>👥 Friends</Text>
        </TouchableOpacity>
      </View>

      {/* Mine / Following tabs */}
      {session && (
        <View style={styles.tabRow}>
          {(['mine', 'following'] as FeedTab[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabChip, tab === t && styles.tabChipActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabChipTxt, tab === t && styles.tabChipTxtActive]}>
                {t === 'mine' ? '👤 Mine' : '👥 Following'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Mine-tab emotion dropdown */}
      {session && tab === 'mine' && (
        <View style={styles.filterWrap}>
          <TouchableOpacity
            style={[styles.filterBar, filterOpen && styles.filterBarOpen]}
            onPress={() => setFilterOpen(v => !v)}
            activeOpacity={0.8}
          >
            <Text style={styles.filterBarTxt}>
              {selectedEmotion
                ? `${selectedEmotion.emoji}  ${selectedEmotion.label}`
                : '💧  All emotions'}
            </Text>
            <Text style={styles.filterArrow}>{filterOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {filterOpen && (
            <View style={styles.dropdown}>
              <TouchableOpacity
                style={[styles.dropdownItem, !mineEmotion && styles.dropdownItemActive]}
                onPress={() => { setMineEmotion(null); setFilterOpen(false); }}
              >
                <Text style={[styles.dropdownTxt, !mineEmotion && styles.dropdownTxtActive]}>
                  💧  All emotions
                </Text>
                {!mineEmotion && <Text style={styles.dropdownCheck}>✓</Text>}
              </TouchableOpacity>
              {EMOTIONS.map(e => (
                <TouchableOpacity
                  key={e.id}
                  style={[styles.dropdownItem, mineEmotion === e.id && styles.dropdownItemActive]}
                  onPress={() => { setMineEmotion(e.id); setFilterOpen(false); }}
                >
                  <Text style={[styles.dropdownTxt, mineEmotion === e.id && { color: e.color }]}>
                    {e.emoji}  {e.label}
                  </Text>
                  {mineEmotion === e.id && <Text style={[styles.dropdownCheck, { color: e.color }]}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      <AuthGateModal visible={authGate} onClose={() => setAuthGate(false)} />

      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6fe0e6" />
        </View>
      ) : (
        <FlatList
          data={displayCries}
          keyExtractor={c => c.id}
          style={{ flex: 1 }}
          renderItem={({ item }) => (
            <FeedItem cry={item} onPress={() => setSelected(item)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={displayCries.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadFeed(true)}
              tintColor="#6fe0e6"
              colors={['#6fe0e6']}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💧</Text>
              <Text style={styles.emptyTitle}>
                {!session
                  ? 'Log in to see the feed'
                  : tab === 'mine'
                    ? 'No cries match'
                    : 'No cries yet'}
              </Text>
              <Text style={styles.emptySub}>
                {!session
                  ? 'Create an account to follow friends and see their cries'
                  : tab === 'mine'
                    ? 'Try a different filter'
                    : 'Follow friends to see their cries here'}
              </Text>
              {session && tab === 'following' && (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push('/friends')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emptyBtnTxt}>👥  Find Friends</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {selected && (
        <DetailModal
          cry={selected}
          myId={session?.user.id ?? null}
          onClose={() => setSelected(null)}
          onLikeToggle={handleLikeToggle}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  headerTitle: { color: '#e2e8f0', fontSize: 26, fontWeight: '700' },
  addFriendsBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#1f2937',
  },
  addFriendsTxt: { color: '#6fe0e6', fontSize: 13, fontWeight: '600' },

  tabRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  filterWrap: {
    marginHorizontal: 16, marginTop: 10, marginBottom: 4, zIndex: 10,
  },
  filterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#111827', borderRadius: 12,
    borderWidth: 1, borderColor: '#1f2937',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  filterBarOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomColor: 'transparent' },
  filterBarTxt: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  filterArrow: { color: '#4a5568', fontSize: 11 },
  dropdown: {
    backgroundColor: '#111827',
    borderWidth: 1, borderTopWidth: 0, borderColor: '#1f2937',
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderTopWidth: 1, borderTopColor: '#1f2937',
  },
  dropdownItemActive: { backgroundColor: '#6fe0e610' },
  dropdownTxt: { color: '#94a3b8', fontSize: 14 },
  dropdownTxtActive: { color: '#6fe0e6' },
  dropdownCheck: { color: '#6fe0e6', fontSize: 14, fontWeight: '700' },
  tabChip: {
    flex: 1, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1, borderColor: '#1f2937', alignItems: 'center',
  },
  tabChipActive: { backgroundColor: '#6fe0e6', borderColor: '#6fe0e6' },
  tabChipTxt: { color: '#4a5568', fontSize: 13, fontWeight: '600' },
  tabChipTxtActive: { color: '#0d1117' },

  listContent: { paddingVertical: 8 },
  separator: { height: 1, backgroundColor: '#1f2937', marginLeft: 68 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, opacity: 0.4 },
  emptyTitle: { color: '#4a5568', fontSize: 17, fontWeight: '600' },
  emptySub: { color: '#374151', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 8, backgroundColor: '#6fe0e6',
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20,
  },
  emptyBtnTxt: { color: '#0d1117', fontSize: 14, fontWeight: '700' },

  item: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  itemContent: { flex: 1, gap: 4 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemUser: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', flex: 1 },
  itemHandle: { color: '#4a5568', fontWeight: '400' },
  timeAgo: { color: '#374151', fontSize: 11, fontFamily: 'monospace' },
  emotionChip: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  noteSnippet: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  itemMeta: { flexDirection: 'row', gap: 8, marginTop: 2 },
  metaTag: { color: '#4a5568', fontSize: 12 },

  // Detail sheet
  backdrop: { flex: 1 },
  kvSheet: { maxHeight: '92%' },
  sheet: {
    backgroundColor: '#111827', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderColor: '#1f2937',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetUser: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  sheetHandle: { color: '#4a5568', fontSize: 12 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#4a5568', fontSize: 18 },
  emotionBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeEmoji: { fontSize: 18 },
  badgeLabel: { fontSize: 15, fontWeight: '700' },
  sheetDate: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace', marginVertical: 6 },
  photo: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#0d1117', marginTop: 8 },
  noteBox: { backgroundColor: '#0d1117', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1f2937', marginTop: 8 },
  noteText: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  audioPlayer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0d1117', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#6fe0e6', marginTop: 8,
  },
  audioIcon: { fontSize: 16, color: '#6fe0e6' },
  audioLabel: { color: '#6fe0e6', fontSize: 14, fontWeight: '500' },

  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#1f2937' },
  likeIcon: { fontSize: 16 },
  likeTxt: { color: '#4a5568', fontSize: 14, fontWeight: '600' },
  likeTxtActive: { color: '#6fe0e6' },
  likeCount: { color: '#4a5568', fontSize: 13 },

  commentsHeader: { color: '#94a3b8', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  noComments: { color: '#374151', fontSize: 13, fontFamily: 'monospace' },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  commentBubble: { flex: 1, backgroundColor: '#0d1117', borderRadius: 10, padding: 10 },
  commentUser: { color: '#6fe0e6', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  commentText: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },

  commentInput: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: '#1f2937',
  },
  commentField: {
    flex: 1, backgroundColor: '#0d1117', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    color: '#e2e8f0', fontSize: 14, maxHeight: 80,
    borderWidth: 1, borderColor: '#1f2937',
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#6fe0e6', alignItems: 'center', justifyContent: 'center',
  },
  sendTxt: { color: '#0d1117', fontSize: 18, fontWeight: '700' },
});
