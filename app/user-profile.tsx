/**
 * Public user profile screen.
 * Opened from friends list, notifications, feed etc.
 * Route: /user-profile?id=UUID
 */
import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/themes';
import { emotionById } from '../lib/emotions';
import { Avatar } from '../components/Avatar';
import { timeAgo } from '../lib/format';
import {
  getProfileStats, followUser, unfollowUser,
  getUserCries, blockUser, unblockUser, isUserBlocked, SocialCry,
  isCryNotifyMuted, setCryNotifyMuted,
} from '../lib/social';
import { ReportSheet } from '../components/ReportSheet';
import { tapLight } from '../lib/haptics';
import { EmotionIcon } from '../components/EmotionIcon';
import { UiIcon } from '../components/UiIcon';
import { Tear } from '../components/EmotionIcon';

interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_uri: string | null;
  bio: string | null;
  is_public: boolean;
  /**
   * The real setting. `is_public` is a derived boolean and only true for
   * 'everyone', so on its own it cannot tell 'followers' apart from 'only_me'
   * and this screen locked out the mutual follows who were meant to get in.
   */
  profile_visibility: 'everyone' | 'followers' | 'only_me' | null;
  /** Separate from profile visibility: a visible profile can still keep its
   *  connections private, the way Facebook and Instagram both allow. */
  show_follow_lists: boolean | null;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { theme: { accent } } = useTheme();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState({ cry_count: 0, follower_count: 0, following_count: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followsMe, setFollowsMe] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  // Whether this person's cries are allowed to notify us. On for everyone you
  // follow; this is the way out for the one friend who cries every day.
  const [criesMuted, setCriesMuted] = useState(false);
  const [cries, setCries] = useState<SocialCry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    (async () => {
      try {
        const [profileRes, statsRes, criesRes] = await Promise.all([
          supabase.from('profiles')
            .select('id, username, display_name, avatar_uri, bio, is_public, profile_visibility, show_follow_lists')
            .eq('id', id).single(),
          getProfileStats(id),
          getUserCries(id),
        ]);
        setProfile(profileRes.data as PublicProfile);
        setStats(statsRes);
        setCries(criesRes);

        if (session) {
          // Both directions: 'followers' means mutual follows, so knowing that
          // you follow them is only half the answer.
          const [followRes, followsMeRes, blockRes, mutedRes] = await Promise.all([
            supabase.from('follows')
              .select('id').eq('follower_id', session.user.id).eq('following_id', id).maybeSingle(),
            supabase.from('follows')
              .select('id').eq('follower_id', id).eq('following_id', session.user.id).maybeSingle(),
            isUserBlocked(id),
            isCryNotifyMuted(id),
          ]);
          setIsFollowing(!!followRes.data);
          setFollowsMe(!!followsMeRes.data);
          setIsBlocked(blockRes);
          setCriesMuted(mutedRes);
        }
      } catch (e) {
        console.warn('[user-profile] load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, session]));

  async function handleMuteToggle() {
    const next = !criesMuted;
    setCriesMuted(next);
    const ok = await setCryNotifyMuted(id!, next);
    // Put the switch back rather than lie about what the server holds.
    if (!ok) setCriesMuted(!next);
  }

  async function handleFollowToggle() {
    if (!session) { Alert.alert('Log in', 'You need an account to follow people.'); return; }
    // Following someone is the moment worth marking; unfollowing isn't.
    if (!isFollowing) tapLight();
    if (isFollowing) {
      await unfollowUser(id!);
      setIsFollowing(false);
      setStats(s => ({ ...s, follower_count: s.follower_count - 1 }));
    } else {
      await followUser(id!);
      setIsFollowing(true);
      setStats(s => ({ ...s, follower_count: s.follower_count + 1 }));
    }
  }

  function handleReport() {
    if (!profile) return;
    setReportOpen(true);
  }

  function handleBlock() {
    Alert.alert(
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? `Unblock @${profile?.username}? They will be able to follow you again.`
        : `Block @${profile?.username}? They will no longer appear in your feed or search.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            if (isBlocked) {
              await unblockUser(id!);
              setIsBlocked(false);
            } else {
              await blockUser(id!);
              setIsBlocked(true);
              setIsFollowing(false);
              router.back();
            }
          },
        },
      ]
    );
  }

  const isOwnProfile = session?.user.id === id;

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <ActivityIndicator size="large" color={accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={[s.backTxt, { color: accent }]}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={s.empty}>
          <View style={s.emptyEmoji}>
            <Tear size={48} filled={false} color="#4a5568" />
          </View>
          <Text style={s.emptyTxt}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // The owner's actual choice, not the flattened boolean. 'followers' means
  // mutual follows, so both directions have to hold. Anything unrecognised
  // falls back to closed rather than open.
  const visibility = profile.profile_visibility ?? (profile.is_public ? 'everyone' : 'only_me');
  const canSeeProfile =
    isOwnProfile ||
    visibility === 'everyone' ||
    (visibility === 'followers' && isFollowing && followsMe);

  // Two gates, not one: you have to be allowed to see the profile at all, and
  // they have to be willing to show who they are connected to.
  const canSeeFollowLists =
    canSeeProfile && (isOwnProfile || profile.show_follow_lists !== false);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>@{profile.username}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Avatar + name */}
        <View style={s.avatarSection}>
          <Avatar uri={profile.avatar_uri} size={88} fallbackColor={accent} />
          <Text style={s.displayName}>{profile.display_name}</Text>
          <Text style={s.handle}>@{profile.username}</Text>
          {profile.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCell}>
            <Text style={s.statValue}>{stats.cry_count}</Text>
            <Text style={s.statLabel}>Cries</Text>
          </View>
          <View style={s.statDivider} />
          {/* Follow lists open only on accounts that are public (or your own) —
              the same gate the cries below use. */}
          <TouchableOpacity
            style={s.statCell}
            disabled={!canSeeFollowLists}
            onPress={() => router.push(`/follow-list?userId=${id}&type=following`)}
          >
            <Text style={s.statValue}>{stats.following_count}</Text>
            <Text style={[s.statLabel, canSeeFollowLists && { color: accent }]}>Following</Text>
          </TouchableOpacity>
          <View style={s.statDivider} />
          <TouchableOpacity
            style={s.statCell}
            disabled={!canSeeFollowLists}
            onPress={() => router.push(`/follow-list?userId=${id}&type=followers`)}
          >
            <Text style={s.statValue}>{stats.follower_count}</Text>
            <Text style={[s.statLabel, canSeeFollowLists && { color: accent }]}>Followers</Text>
          </TouchableOpacity>
        </View>

        {/* Follow + Block buttons */}
        {!isOwnProfile && session && (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={[isFollowing ? s.btnFollowing : [s.btnFollow, { backgroundColor: accent }], { flex: 1 }]}
              onPress={handleFollowToggle}
              activeOpacity={0.85}
            >
              <Text style={isFollowing ? s.btnFollowingTxt : s.btnFollowTxt}>
                {isFollowing ? 'Unfollow' : 'Follow'}
              </Text>
            </TouchableOpacity>
            {/* Only while you follow them: there is nothing to mute otherwise. */}
            {isFollowing && (
              <TouchableOpacity
                style={s.btnSecondary}
                onPress={handleMuteToggle}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: criesMuted }}
                accessibilityLabel={criesMuted
                  ? 'Get notified when they log a cry'
                  : 'Stop being notified when they log a cry'}
              >
                <UiIcon name="bell" size={16} color={criesMuted ? '#4a5568' : '#94a3b8'} />
              </TouchableOpacity>
            )}
            {/* Both written out. Two bare glyphs sat here before, and a report
                button that isn't labelled as one is the exact thing Apple
                calls out under Guideline 1.2. */}
            <TouchableOpacity
              style={s.btnSecondary}
              onPress={handleBlock}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={isBlocked ? 'Unblock this account' : 'Block this account'}
            >
              <Text style={s.btnSecondaryTxt}>{isBlocked ? 'Unblock' : 'Block'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.btnSecondary}
              onPress={handleReport}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Report this account"
            >
              <Text style={[s.btnSecondaryTxt, { color: '#ef4444' }]}>Report</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cries list */}
        {canSeeProfile && cries.length > 0 && (
          <>
            <View style={s.criesHeader}>
              <Text style={s.criesTitle}>CRIES</Text>
              <Text style={s.criesCount}>{cries.length}</Text>
            </View>
            {cries.map(cry => {
              const emotion = emotionById(cry.emotion);
              const color = emotion?.color ?? '#6fe0e6';
              return (
                <TouchableOpacity
                  key={cry.id}
                  style={s.cryRow}
                  activeOpacity={0.75}
                  onPress={() => router.push(`/cry-detail?id=${cry.id}`)}
                >
                  <View style={[s.cryDot, { backgroundColor: color + '22' }]}>
                    <EmotionIcon emotion={cry.emotion} size={26} label={emotion?.label ?? cry.emotion} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.cryEmotion, { color }]}>{emotion?.label ?? cry.emotion}</Text>
                    {cry.note
                      ? <Text style={s.cryNote} numberOfLines={1}>{cry.note}</Text>
                      : null}
                  </View>
                  <Text style={s.cryTime}>{timeAgo(cry.created_at)}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <ReportSheet
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          target="user"
          targetId={id!}
          authorId={id}
          authorUsername={profile.username}
        />

        {/* Locked message. Says which door is shut, since "friends only" is a
            different situation from "nobody" and is one the viewer can act on. */}
        {!canSeeProfile && (
          <View style={s.privateBox}>
            <View style={s.privateEmoji}>
              <UiIcon name="lock" size={36} color="#4a5568" strokeWidth={1.5} />
            </View>
            <Text style={s.privateTxt}>
              {visibility === 'followers'
                ? 'Only mutual follows can see this account'
                : 'This account is private'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#6fe0e6', fontSize: 20 },
  headerTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '600' },
  content: { paddingBottom: 48 },
  avatarSection: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  displayName: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  handle: { color: '#4a5568', fontSize: 15, fontFamily: 'monospace' },
  bio: { color: '#64748b', fontSize: 15, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20, marginTop: 4 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 20,
    backgroundColor: '#111827', borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937', paddingVertical: 16,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  statLabel: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace' },
  statDivider: { width: 1, height: 30, backgroundColor: '#1f2937' },
  actionRow: {
    flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 8,
  },
  btnFollow: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  btnFollowTxt: { color: '#0d1117', fontSize: 17, fontWeight: '700' },
  btnFollowing: {
    borderRadius: 14, borderWidth: 1, borderColor: '#ef4444',
    backgroundColor: '#ef444422',
    paddingVertical: 14, alignItems: 'center',
  },
  btnFollowingTxt: { color: '#ef4444', fontSize: 17, fontWeight: '700' },
  btnSecondary: {
    paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center',
  },
  btnSecondaryTxt: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },

  criesHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
  },
  criesTitle: {
    color: '#4a5568', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  criesCount: { color: '#374151', fontSize: 13, fontFamily: 'monospace' },
  cryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  cryDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cryEmotion: { fontSize: 15, fontWeight: '600' },
  cryNote: { color: '#64748b', fontSize: 13 },
  cryTime: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace' },

  privateBox: { alignItems: 'center', paddingVertical: 32, gap: 8, marginHorizontal: 20 },
  privateEmoji: { opacity: 0.4 },
  privateTxt: { color: '#4a5568', fontSize: 15 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyEmoji: { opacity: 0.4 },
  emptyTxt: { color: '#4a5568', fontSize: 17 },
});
