/**
 * Full cry detail screen.
 * Opened from notifications (like/comment) or anywhere a cry_id is available.
 * Route: /cry-detail?id=UUID
 */
import { useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, TextInput, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { emotionById } from '../lib/emotions';
import { useAuth } from '../lib/auth';
import {
  getCry, likeCry, unlikeCry, getComments, addComment, SocialCry, Comment,
  reportContent,
} from '../lib/social';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFullDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

function Avatar({ uri, size = 40 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.45 }}>💧</Text>
    </View>
  );
}

function Drops({ intensity, size = 16 }: { intensity: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: size, opacity: n <= intensity ? 1 : 0.2 }}>💧</Text>
      ))}
    </View>
  );
}

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
      sound.setOnPlaybackStatusUpdate(st => {
        if (st.isLoaded && st.didJustFinish) { setPlaying(false); sound.unloadAsync(); }
      });
      await sound.playAsync();
    } catch { Alert.alert('Error', 'Could not play audio.'); }
  }
  return (
    <TouchableOpacity style={s.audioBtn} onPress={toggle} activeOpacity={0.8}>
      <Text style={s.audioIcon}>{playing ? '⏹' : '▶'}</Text>
      <Text style={s.audioTxt}>{playing ? 'Stop voice note' : 'Play voice note'}</Text>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [cry, setCry] = useState<SocialCry | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    (async () => {
      const [cryData, commentData] = await Promise.all([
        getCry(id),
        getComments(id),
      ]);
      if (cryData) {
        setCry(cryData);
        setLiked(cryData.liked_by_me);
        setLikeCount(cryData.like_count);
      }
      setComments(commentData);
      setLoading(false);
    })();
  }, [id]));

  async function toggleLike() {
    if (!session || !cry) return;
    const next = !liked;
    setLiked(next);
    setLikeCount(c => c + (next ? 1 : -1));
    if (next) await likeCry(cry.id); else await unlikeCry(cry.id);
  }

  async function submitComment() {
    if (!commentText.trim() || !session) return;
    setPosting(true);
    const c = await addComment(id!, commentText.trim());
    if (c) setComments(prev => [...prev, c]);
    setCommentText('');
    setPosting(false);
  }

  const emotion = cry ? emotionById(cry.emotion) : null;
  const isOwn = session?.user.id === cry?.user_id;

  function handleReport() {
    if (!cry) return;
    Alert.alert(
      'Report Cry',
      'Why are you reporting this?',
      [
        { text: 'Inappropriate content', onPress: () => submitReport('Inappropriate content') },
        { text: 'Harassment', onPress: () => submitReport('Harassment') },
        { text: 'Spam', onPress: () => submitReport('Spam') },
        { text: 'Other', onPress: () => submitReport('Other') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function submitReport(reason: string) {
    if (!cry) return;
    const result = await reportContent('cry', cry.id, reason);
    if (result === 'ok') {
      Alert.alert('Reported', "Thanks for your report. We'll review it shortly.");
    } else if (result === 'duplicate') {
      Alert.alert('Already reported', "You've already reported this cry.");
    } else {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
        </View>
        <ActivityIndicator size="large" color="#6fe0e6" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!cry) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={s.empty}>
          <Text style={{ fontSize: 40, opacity: 0.3 }}>💧</Text>
          <Text style={s.emptyTxt}>Cry not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cry</Text>
        {!isOwn && session && cry ? (
          <TouchableOpacity style={s.backBtn} onPress={handleReport} activeOpacity={0.7}>
            <Text style={s.menuTxt}>⋯</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Profile row */}
          <TouchableOpacity
            style={s.profileRow}
            activeOpacity={0.75}
            onPress={() => router.push(`/user-profile?id=${cry.user_id}`)}
          >
            <Avatar uri={cry.profile.avatar_uri} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{cry.profile.display_name}</Text>
              <Text style={s.profileHandle}>@{cry.profile.username}</Text>
            </View>
            <Text style={s.profileArrow}>›</Text>
          </TouchableOpacity>

          {/* Emotion badge */}
          <View style={[s.emotionBadge, { backgroundColor: (emotion?.color ?? '#6fe0e6') + '22' }]}>
            <Text style={{ fontSize: 22 }}>{emotion?.emoji ?? '💧'}</Text>
            <Text style={[s.emotionLabel, { color: emotion?.color ?? '#6fe0e6' }]}>
              {emotion?.label ?? cry.emotion}
            </Text>
          </View>

          <Text style={s.dateText}>{formatFullDate(cry.created_at)}</Text>
          <Drops intensity={cry.intensity} />

          {cry.photo_uri
            ? <Image source={{ uri: cry.photo_uri }} style={s.photo} resizeMode="cover" />
            : null}
          {cry.note
            ? <View style={s.noteBox}><Text style={s.noteText}>{cry.note}</Text></View>
            : null}
          {cry.audio_uri ? <AudioPlayer uri={cry.audio_uri} /> : null}

          {/* Like */}
          <View style={s.likeRow}>
            {!isOwn && session && (
              <TouchableOpacity style={s.likeBtn} onPress={toggleLike} activeOpacity={0.75}>
                <Text style={{ fontSize: 16 }}>{liked ? '💧' : '🤍'}</Text>
                <Text style={[s.likeTxt, liked && s.likeTxtActive]}>
                  {liked ? 'Liked' : 'Like'}
                </Text>
              </TouchableOpacity>
            )}
            {likeCount > 0 && (
              <Text style={s.likeCount}>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</Text>
            )}
          </View>

          {/* Comments */}
          <Text style={s.sectionLabel}>COMMENTS</Text>
          {comments.length === 0
            ? <Text style={s.noComments}>No comments yet</Text>
            : comments.map(c => (
              <View key={c.id} style={s.commentRow}>
                <Avatar uri={c.profile.avatar_uri} size={30} />
                <View style={s.commentBubble}>
                  <Text style={s.commentUser}>{c.profile.display_name}</Text>
                  <Text style={s.commentText}>{c.content}</Text>
                </View>
              </View>
            ))
          }
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Comment input */}
        {session && (
          <View style={s.inputRow}>
            <TextInput
              style={s.inputField}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Add a comment…"
              placeholderTextColor="#4a5568"
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!commentText.trim() || posting) && { opacity: 0.4 }]}
              onPress={submitComment}
              disabled={!commentText.trim() || posting}
            >
              {posting
                ? <ActivityIndicator size="small" color="#0d1117" />
                : <Text style={s.sendTxt}>↑</Text>}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#6fe0e6', fontSize: 22 },
  menuTxt: { color: '#4a5568', fontSize: 22, fontWeight: '700' },
  headerTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '600' },

  content: { padding: 20, gap: 14 },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },

  profileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111827', borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: '#1f2937',
  },
  profileName: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  profileHandle: { color: '#4a5568', fontSize: 13 },
  profileArrow: { color: '#4a5568', fontSize: 22 },

  emotionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start',
  },
  emotionLabel: { fontSize: 17, fontWeight: '700' },
  dateText: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace' },

  photo: { width: '100%', height: 200, borderRadius: 14, backgroundColor: '#1f2937' },
  noteBox: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1f2937',
  },
  noteText: { color: '#94a3b8', fontSize: 14, lineHeight: 22 },

  audioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111827', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#6fe0e6',
  },
  audioIcon: { fontSize: 16, color: '#6fe0e6' },
  audioTxt: { color: '#6fe0e6', fontSize: 14, fontWeight: '500' },

  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  likeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
    borderWidth: 1, borderColor: '#1f2937',
  },
  likeTxt: { color: '#4a5568', fontSize: 14, fontWeight: '600' },
  likeTxtActive: { color: '#6fe0e6' },
  likeCount: { color: '#4a5568', fontSize: 13 },

  sectionLabel: {
    color: '#4a5568', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase', marginTop: 8,
  },
  noComments: { color: '#374151', fontSize: 13, fontFamily: 'monospace' },
  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentBubble: {
    flex: 1, backgroundColor: '#111827', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#1f2937',
  },
  commentUser: { color: '#6fe0e6', fontSize: 12, fontWeight: '600', marginBottom: 3 },
  commentText: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#1f2937',
    backgroundColor: '#0d1117',
  },
  inputField: {
    flex: 1, backgroundColor: '#111827', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    color: '#e2e8f0', fontSize: 14, maxHeight: 80,
    borderWidth: 1, borderColor: '#1f2937',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#6fe0e6', alignItems: 'center', justifyContent: 'center',
  },
  sendTxt: { color: '#0d1117', fontSize: 18, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTxt: { color: '#4a5568', fontSize: 16 },
});
