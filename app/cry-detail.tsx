// Platform-specific: iOS + Android (keyboard avoidance behavior)
/**
 * Full cry detail screen.
 * Opened from notifications (like/comment) or anywhere a cry_id is available.
 * Route: /cry-detail?id=UUID
 */
import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { emotionById } from '../lib/emotions';
import { useAuth } from '../lib/auth';
import {
  getCry, likeCry, unlikeCry, hugCry, unhugCry, getComments, addComment, deleteComment,
  likeComment, unlikeComment,
  SocialCry, Comment, reportContent,
} from '../lib/social';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/themes';
import { Avatar } from '../components/Avatar';
import { Drops } from '../components/Drops';
import { AudioPlayer } from '../components/AudioPlayer';
import { CryPhoto } from '../components/CryPhoto';
import { fullDateTime } from '../lib/format';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme: { accent } } = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const [cry, setCry] = useState<SocialCry | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [hugged, setHugged] = useState(false);
  const [hugCount, setHugCount] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    setCommentsDisabled(false);
    (async () => {
      try {
        const [cryData, commentData] = await Promise.all([
          getCry(id),
          getComments(id),
        ]);
        if (cryData) {
          setCry(cryData);
          setLiked(cryData.liked_by_me);
          setLikeCount(cryData.like_count);
          setHugged(cryData.hugged_by_me);
          setHugCount(cryData.hug_count);

          const isOwner = cryData.user_id === session?.user.id;
          if (!isOwner) {
            const { data: ownerProfile } = await supabase
              .from('profiles')
              .select('allow_comments')
              .eq('id', cryData.user_id)
              .single();
            if (ownerProfile?.allow_comments === false) {
              setCommentsDisabled(true);
            }
          }
        }
        setComments(commentData);
      } catch (e) {
        console.warn('[cry-detail] load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]));

  async function toggleLike() {
    if (!session || !cry) return;
    const next = !liked;
    setLiked(next);
    setLikeCount(c => c + (next ? 1 : -1));
    try {
      if (next) await likeCry(cry.id); else await unlikeCry(cry.id);
    } catch {
      // Roll the optimistic update back (e.g. offline)
      setLiked(!next);
      setLikeCount(c => c + (next ? -1 : 1));
    }
  }

  async function toggleHug() {
    if (!session || !cry) return;
    const next = !hugged;
    setHugged(next);
    setHugCount(c => c + (next ? 1 : -1));
    try {
      if (next) await hugCry(cry.id); else await unhugCry(cry.id);
    } catch {
      // Roll the optimistic update back (e.g. offline)
      setHugged(!next);
      setHugCount(c => c + (next ? -1 : 1));
    }
  }

  function confirmDeleteComment(c: Comment) {
    Alert.alert('Delete comment', 'Delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteComment(c.id);
          // DB cascades replies; mirror that locally
          setComments(prev => prev.filter(x => x.id !== c.id && x.parent_comment_id !== c.id));
        },
      },
    ]);
  }

  async function submitComment() {
    if (!commentText.trim() || !session) return;
    setPosting(true);
    try {
      // Replies always attach to the top-level comment so threads stay one
      // level deep (replying to a reply targets its parent thread).
      const parentId = replyTo ? (replyTo.parent_comment_id ?? replyTo.id) : undefined;
      const c = await addComment(id!, commentText.trim(), parentId);
      if (c) setComments(prev => [...prev, c]);
      setCommentText('');
      setReplyTo(null);
    } catch (e: any) {
      if (e?.code === 'COMMENTS_DISABLED') {
        setCommentsDisabled(true); // swap input for the notice bar
      } else {
        Alert.alert('Error', 'Could not post comment. Please try again.');
      }
    }
    setPosting(false);
  }

  async function toggleCommentLike(c: Comment) {
    if (!session) return;
    const next = !c.liked_by_me;
    setComments(prev => prev.map(x => x.id === c.id
      ? { ...x, liked_by_me: next, like_count: x.like_count + (next ? 1 : -1) }
      : x));
    try {
      if (next) await likeComment(c.id); else await unlikeComment(c.id);
    } catch {
      // Roll back the optimistic update (e.g. offline)
      setComments(prev => prev.map(x => x.id === c.id
        ? { ...x, liked_by_me: !next, like_count: x.like_count + (next ? -1 : 1) }
        : x));
    }
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
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={[s.backTxt, { color: accent }]}>←</Text>
          </TouchableOpacity>
        </View>
        <ActivityIndicator size="large" color={accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!cry) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={[s.backTxt, { color: accent }]}>←</Text>
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
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={[s.backTxt, { color: accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cry</Text>
        {isOwn && cry ? (
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => router.push(`/log-cry?editId=${cry.id}`)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Edit this cry"
          >
            <Text style={{ fontSize: 17 }}>✏️</Text>
          </TouchableOpacity>
        ) : !isOwn && session && cry ? (
          <TouchableOpacity style={s.backBtn} onPress={handleReport} activeOpacity={0.7}>
            <Text style={s.menuTxt}>⋯</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        automaticOffset
        style={{ flex: 1 }}
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

          <Text style={s.dateText}>{fullDateTime(cry.created_at)}</Text>
          <Drops intensity={cry.intensity} />

          {cry.tags && cry.tags.length > 0 && (
            <View style={s.tagsRow}>
              {cry.tags.map(t => (
                <Text key={t} style={s.tagPill}>#{t}</Text>
              ))}
            </View>
          )}

          {cry.photo_uri
            ? <CryPhoto uri={cry.photo_uri} style={s.photo} />
            : null}
          {cry.note
            ? <View style={s.noteBox}><Text style={s.noteText}>{cry.note}</Text></View>
            : null}
          {cry.audio_uri ? <AudioPlayer uri={cry.audio_uri} /> : null}

          {/* Like + Hug */}
          <View style={s.likeRow}>
            {!isOwn && session && (
              <>
                <TouchableOpacity style={s.likeBtn} onPress={toggleLike} activeOpacity={0.75}>
                  <Text style={{ fontSize: 16 }}>{liked ? '💧' : '🤍'}</Text>
                  <Text style={[s.likeTxt, liked && { color: accent }]}>
                    {liked ? 'Liked' : 'Like'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.likeBtn} onPress={toggleHug} activeOpacity={0.75}
                  accessibilityRole="button" accessibilityLabel={hugged ? 'Remove hug' : 'Send a hug'}
                >
                  <Text style={{ fontSize: 16 }}>🫂</Text>
                  <Text style={[s.likeTxt, hugged && { color: accent }]}>
                    {hugged ? 'Hugged' : 'Hug'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {(likeCount > 0 || hugCount > 0) && (
              <Text style={s.likeCount}>
                {[
                  likeCount > 0 ? `${likeCount} ${likeCount === 1 ? 'like' : 'likes'}` : null,
                  hugCount > 0 ? `${hugCount} ${hugCount === 1 ? 'hug' : 'hugs'}` : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>

          {/* Comments — one-level threads: top-level comments with replies below */}
          <Text style={s.sectionLabel}>COMMENTS</Text>
          {commentsDisabled ? (
            <Text style={s.commentsOffTxt}>💬  Comments have been turned off</Text>
          ) : comments.length === 0 ? (
            <Text style={s.noComments}>No comments yet</Text>
          ) : (
            comments
              .filter(c => !c.parent_comment_id)
              .map(parent => (
                <View key={parent.id}>
                  <CommentItem
                    comment={parent}
                    accent={accent}
                    isOwn={parent.user_id === session?.user.id}
                    canInteract={!!session}
                    onLike={() => toggleCommentLike(parent)}
                    onReply={() => setReplyTo(parent)}
                    onDelete={() => confirmDeleteComment(parent)}
                  />
                  {comments
                    .filter(r => r.parent_comment_id === parent.id)
                    .map(reply => (
                      <View key={reply.id} style={s.replyIndent}>
                        <CommentItem
                          comment={reply}
                          accent={accent}
                          isOwn={reply.user_id === session?.user.id}
                          canInteract={!!session}
                          onLike={() => toggleCommentLike(reply)}
                          onReply={() => setReplyTo(reply)}
                          onDelete={() => confirmDeleteComment(reply)}
                        />
                      </View>
                    ))}
                </View>
              ))
          )}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Comment input — hidden entirely when comments are disabled */}
        {session && !commentsDisabled && (
          <View>
          {replyTo && (
            <View style={s.replyingBar}>
              <Text style={s.replyingTxt} numberOfLines={1}>
                Replying to <Text style={{ color: accent }}>@{replyTo.profile.username}</Text>
              </Text>
              <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
                <Text style={s.replyingClose}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={s.inputRow}>
            <TextInput
              style={s.inputField}
              value={commentText}
              onChangeText={setCommentText}
              placeholder={replyTo ? `Reply to @${replyTo.profile.username}…` : 'Add a comment…'}
              placeholderTextColor="#4a5568"
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: accent }, (!commentText.trim() || posting) && { opacity: 0.4 }]}
              onPress={submitComment}
              disabled={!commentText.trim() || posting}
            >
              {posting
                ? <ActivityIndicator size="small" color="#0d1117" />
                : <Text style={s.sendTxt}>↑</Text>}
            </TouchableOpacity>
          </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Comment bubble with like + reply actions ─────────────────────────────────

function CommentItem({ comment, accent, isOwn, canInteract, onLike, onReply, onDelete }: {
  comment: Comment;
  accent: string;
  isOwn: boolean;
  canInteract: boolean;
  onLike: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={s.commentRow}>
      <Avatar uri={comment.profile.avatar_uri} size={30} />
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          style={s.commentBubble}
          activeOpacity={isOwn ? 0.7 : 1}
          onLongPress={isOwn ? onDelete : undefined}
          delayLongPress={400}
          accessibilityHint={isOwn ? 'Hold to delete your comment' : undefined}
        >
          <Text style={[s.commentUser, { color: accent }]}>{comment.profile.display_name}</Text>
          <Text style={s.commentText}>{comment.content}</Text>
        </TouchableOpacity>
        {canInteract && (
          <View style={s.commentActions}>
            <TouchableOpacity onPress={onLike} hitSlop={8} accessibilityRole="button" accessibilityLabel="Like comment">
              <Text style={[s.commentAction, comment.liked_by_me && { color: accent }]}>
                {comment.liked_by_me ? '💧' : '🤍'}{comment.like_count > 0 ? ` ${comment.like_count}` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onReply} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reply to comment">
              <Text style={s.commentAction}>Reply</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
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

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagPill: {
    color: '#94a3b8', fontSize: 12, fontWeight: '500',
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    overflow: 'hidden',
  },

  photo: { width: '100%', height: 200, borderRadius: 14, backgroundColor: '#1f2937' },
  noteBox: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1f2937',
  },
  noteText: { color: '#94a3b8', fontSize: 14, lineHeight: 22 },

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

  commentsOffTxt: { color: '#374151', fontSize: 13, fontFamily: 'monospace', marginTop: 2 },
  commentActions: { flexDirection: 'row', gap: 16, marginTop: 4, marginLeft: 4 },
  commentAction: { color: '#4a5568', fontSize: 12, fontWeight: '600' },
  replyIndent: { marginLeft: 40, marginTop: 8 },

  replyingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#1f2937',
    backgroundColor: '#111827',
  },
  replyingTxt: { flex: 1, color: '#4a5568', fontSize: 12 },
  replyingClose: { color: '#4a5568', fontSize: 14, padding: 2 },

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
