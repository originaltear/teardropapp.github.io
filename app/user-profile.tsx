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
import { getProfileStats, followUser, unfollowUser } from '../lib/social';

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

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState({ cry_count: 0, follower_count: 0, following_count: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    (async () => {
      const [profileRes, statsRes] = await Promise.all([
        supabase.from('profiles')
          .select('id, username, display_name, avatar_uri, bio, is_public')
          .eq('id', id).single(),
        getProfileStats(id),
      ]);
      setProfile(profileRes.data as PublicProfile);
      setStats(statsRes);

      if (session) {
        const { data } = await supabase.from('follows')
          .select('id').eq('follower_id', session.user.id).eq('following_id', id).single();
        setIsFollowing(!!data);
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

        {/* Follow button */}
        {!isOwnProfile && (
          <TouchableOpacity
            style={isFollowing ? s.btnFollowing : s.btnFollow}
            onPress={handleFollowToggle}
            activeOpacity={0.85}
          >
            <Text style={isFollowing ? s.btnFollowingTxt : s.btnFollowTxt}>
              {isFollowing ? 'Unfollow' : 'Follow'}
            </Text>
          </TouchableOpacity>
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
  btnFollow: {
    backgroundColor: '#6fe0e6', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginHorizontal: 20,
  },
  btnFollowTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
  btnFollowing: {
    borderRadius: 14, borderWidth: 1, borderColor: '#ef4444',
    backgroundColor: '#ef444422',
    paddingVertical: 14, alignItems: 'center', marginHorizontal: 20,
  },
  btnFollowingTxt: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyEmoji: { fontSize: 48, opacity: 0.4 },
  emptyTxt: { color: '#4a5568', fontSize: 16 },
});
