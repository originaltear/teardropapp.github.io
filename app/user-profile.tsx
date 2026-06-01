/**
 * Public user profile screen.
 * Opened from friends list, notifications, feed etc.
 * Route: /user-profile?id=UUID
 */
import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { emotionById } from '../lib/emotions';
import {
  getProfileStats, followUser, unfollowUser,
  getUserCries, blockUser, unblockUser, isUserBlocked, reportContent, SocialCry,
} from '../lib/social';

interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_uri: string | null;
  bio: string | null;
  is_public: boolean;
}

function Avatar({ uri, size = 80 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#6fe0e6', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.45 }}>💧</Text>
    </View>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso), now = Date.now(), diff = now - d.getTime();
  const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState({ cry_count: 0, follower_count: 0, following_count: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [cries, setCries] = useState<SocialCry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    (async () => {
      const [profileRes, statsRes, criesRes] = await Promise.all([
        supabase.from('profiles')
          .select('id, username, display_name, avatar_uri, bio, is_public')
          .eq('id', id).single(),
        getProfileStats(id),
        getUserCries(id),
      ]);
      setProfile(profileRes.data as PublicProfile);
      setStats(statsRes);
      setCries(criesRes);

      if (session) {
        const [followRes, blockRes] = await Promise.all([
          supabase.from('follows')
            .select('id').eq('follower_id', session.user.id).eq('following_id', id).maybeSingle(),
          isUserBlocked(id),
        ]);
        setIsFollowing(!!followRes.data);
        setIsBlocked(blockRes);
      }
      setLoading(false);
    })();
  }, [id, session]));

  async function handleFollowToggle() {
    if (!session) { Alert.alert('Log in', 'You need an account to follow people.'); return; }
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
    Alert.alert(
      `Report @${profile.username}`,
      'Why are you reporting this account?',
      [
        { text: 'Inappropriate content', onPress: () => submitUserReport('Inappropriate content') },
        { text: 'Harassment', onPress: () => submitUserReport('Harassment') },
        { text: 'Spam', onPress: () => submitUserReport('Spam') },
        { text: 'Other', onPress: () => submitUserReport('Other') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function submitUserReport(reason: string) {
    if (!id) return;
    const result = await reportContent('user', id, reason);
    if (result === 'ok') {
      Alert.alert('Reported', "Thanks for your report. We'll review it shortly.");
    } else if (result === 'duplicate') {
      Alert.alert('Already reported', "You've already reported this account.");
    } else {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
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
        <ActivityIndicator size="large" color="#6fe0e6" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>💧</Text>
          <Text style={s.emptyTxt}>User not found</Text>
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
        <Text style={s.headerTitle}>@{profile.username}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Avatar + name */}
        <View style={s.avatarSection}>
          <Avatar uri={profile.avatar_uri} size={88} />
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
          <View style={s.statCell}>
            <Text style={s.statValue}>{stats.following_count}</Text>
            <Text style={s.statLabel}>Following</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statCell}>
            <Text style={s.statValue}>{stats.follower_count}</Text>
            <Text style={s.statLabel}>Followers</Text>
          </View>
        </View>

        {/* Follow + Block buttons */}
        {!isOwnProfile && session && (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={[isFollowing ? s.btnFollowing : s.btnFollow, { flex: 1 }]}
              onPress={handleFollowToggle}
              activeOpacity={0.85}
            >
              <Text style={isFollowing ? s.btnFollowingTxt : s.btnFollowTxt}>
                {isFollowing ? 'Unfollow' : 'Follow'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.btnBlock}
              onPress={handleBlock}
              activeOpacity={0.85}
            >
              <Text style={s.btnBlockTxt}>{isBlocked ? '🔓' : '🚫'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.btnBlock}
              onPress={handleReport}
              activeOpacity={0.85}
            >
              <Text style={[s.btnBlockTxt, { color: '#ef4444' }]}>⚑</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cries list */}
        {(profile?.is_public || isOwnProfile) && cries.length > 0 && (
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
                    <Text style={{ fontSize: 18 }}>{emotion?.emoji ?? '💧'}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.cryEmotion, { color }]}>{emotion?.label ?? cry.emotion}</Text>
                    {cry.note
                      ? <Text style={s.cryNote} numberOfLines={1}>{cry.note}</Text>
                      : null}
                  </View>
                  <Text style={s.cryTime}>{formatDate(cry.created_at)}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Private account message */}
        {!profile?.is_public && !isOwnProfile && (
          <View style={s.privateBox}>
            <Text style={s.privateEmoji}>🔒</Text>
            <Text style={s.privateTxt}>This account is private</Text>
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
  backTxt: { color: '#6fe0e6', fontSize: 22 },
  headerTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '600' },
  content: { paddingBottom: 48 },
  avatarSection: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  displayName: { color: '#e2e8f0', fontSize: 22, fontWeight: '700' },
  handle: { color: '#4a5568', fontSize: 14, fontFamily: 'monospace' },
  bio: { color: '#64748b', fontSize: 14, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20, marginTop: 4 },
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
  btnFollowTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
  btnFollowing: {
    borderRadius: 14, borderWidth: 1, borderColor: '#ef4444',
    backgroundColor: '#ef444422',
    paddingVertical: 14, alignItems: 'center',
  },
  btnFollowingTxt: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
  btnBlock: {
    width: 50, borderRadius: 14, borderWidth: 1, borderColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center',
  },
  btnBlockTxt: { fontSize: 20 },

  criesHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
  },
  criesTitle: {
    color: '#4a5568', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  criesCount: { color: '#374151', fontSize: 12, fontFamily: 'monospace' },
  cryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  cryDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cryEmotion: { fontSize: 14, fontWeight: '600' },
  cryNote: { color: '#64748b', fontSize: 12 },
  cryTime: { color: '#4a5568', fontSize: 11, fontFamily: 'monospace' },

  privateBox: { alignItems: 'center', paddingVertical: 32, gap: 8, marginHorizontal: 20 },
  privateEmoji: { fontSize: 36, opacity: 0.4 },
  privateTxt: { color: '#4a5568', fontSize: 14 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyEmoji: { fontSize: 48, opacity: 0.4 },
  emptyTxt: { color: '#4a5568', fontSize: 16 },
});
