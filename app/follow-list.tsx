/**
 * Full-screen following / followers list.
 * Route: /follow-list?userId=UUID&type=following|followers
 */
import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getFollowList, followUser, unfollowUser, UserResult } from '../lib/social';
import { useTheme } from '../lib/themes';
import { useAuth } from '../lib/auth';

function Avatar({ uri, size = 46 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.42 }}>💧</Text>
    </View>
  );
}

export default function FollowListScreen() {
  const { userId, type } = useLocalSearchParams<{ userId: string; type: 'followers' | 'following' }>();
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const { session } = useAuth();
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!userId || !type) { setLoading(false); return; }
    getFollowList(userId, type as 'followers' | 'following')
      .then(u => setUsers(u))
      .catch(e => console.warn('[follow-list] load failed:', e))
      .finally(() => setLoading(false));
  }, [userId, type]));

  async function handleToggle(u: UserResult) {
    if (!session) { Alert.alert('Log in', 'You need an account to follow people.'); return; }
    if (u.relation === 'following') {
      Alert.alert('Unfollow', `Unfollow @${u.username}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unfollow', style: 'destructive', onPress: async () => {
          await unfollowUser(u.id);
          setUsers(prev => prev.map(x => x.id === u.id ? { ...x, relation: 'none' as const } : x));
        }},
      ]);
    } else if (u.relation === 'none') {
      await followUser(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, relation: 'following' as const } : x));
    }
  }

  const title = type === 'followers' ? 'Followers' : 'Following';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>{title}</Text>
        <Text style={s.count}>{loading ? '' : users.length}</Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={u => u.id}
          renderItem={({ item: u }) => (
            <TouchableOpacity
              style={s.row}
              activeOpacity={0.75}
              onPress={() => router.push(`/user-profile?id=${u.id}`)}
            >
              <Avatar uri={u.avatar_uri} />
              <View style={s.info}>
                <Text style={s.name}>{u.display_name}</Text>
                <Text style={s.handle}>@{u.username}</Text>
              </View>
              {u.relation !== 'self' && (
                <TouchableOpacity
                  style={u.relation === 'following' ? s.btnFollowing : s.btnFollow}
                  onPress={() => handleToggle(u)}
                  activeOpacity={0.8}
                >
                  <Text style={u.relation === 'following' ? s.btnFollowingTxt : s.btnFollowTxt}>
                    {u.relation === 'following' ? 'Unfollow' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          contentContainerStyle={users.length === 0 ? s.emptyWrap : undefined}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 40, opacity: 0.4 }}>👥</Text>
              <Text style={s.emptyTxt}>
                {type === 'followers' ? 'No followers yet' : 'Not following anyone'}
              </Text>
            </View>
          }
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  handle: { color: '#4a5568', fontSize: 13 },
  btnFollow: { backgroundColor: '#6fe0e6', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  btnFollowTxt: { color: '#0d1117', fontSize: 13, fontWeight: '700' },
  btnFollowing: { backgroundColor: '#ef444422', borderWidth: 1, borderColor: '#ef4444', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  btnFollowingTxt: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  sep: { height: 1, backgroundColor: '#1f2937', marginLeft: 74 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, padding: 40 },
  emptyTxt: { color: '#4a5568', fontSize: 16 },
});
