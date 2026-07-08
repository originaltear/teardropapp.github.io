/**
 * Close Friends screen
 *
 * Shows your current close friends list with remove option.
 * Shows your followers so you can add them to close friends.
 */
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/themes';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth';
import {
  getCloseFriends, addCloseFriend, removeCloseFriend,
  getFollowList, UserResult,
} from '../lib/social';

function Avatar({ uri, size = 40 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.4 }}>💧</Text>
    </View>
  );
}

export default function CloseFriendsScreen() {
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const { session } = useAuth();

  const [followers, setFollowers] = useState<UserResult[]>([]);
  const [closeFriendIds, setCloseFriendIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  useFocusEffect(useCallback(() => {
    if (!session) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const [cf, fl] = await Promise.all([
          getCloseFriends(),
          getFollowList(session.user.id, 'followers'),
        ]);
        setCloseFriendIds(new Set(cf.map(c => c.friend_id)));
        setFollowers(fl.filter(f => f.id !== session.user.id));
      } catch (e) {
        console.warn('[close-friends] load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session]));

  async function toggle(userId: string) {
    if (toggling.has(userId)) return;
    setToggling(prev => new Set([...prev, userId]));
    const isClose = closeFriendIds.has(userId);
    if (isClose) {
      await removeCloseFriend(userId);
      setCloseFriendIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
    } else {
      await addCloseFriend(userId);
      setCloseFriendIds(prev => new Set([...prev, userId]));
    }
    setToggling(prev => { const s = new Set(prev); s.delete(userId); return s; });
  }

  const sections = [
    {
      title: `Close Friends (${closeFriendIds.size})`,
      data: followers.filter(f => closeFriendIds.has(f.id)),
      isClose: true,
    },
    {
      title: 'Add from followers',
      data: followers.filter(f => !closeFriendIds.has(f.id)),
      isClose: false,
    },
  ].filter(s => s.data.length > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Close Friends</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={styles.subtitle}>
        Close Friends can see cries you mark as "Close Friends only". You can only add people who already follow you back.
      </Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={accent} />
        </View>
      ) : followers.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>👥</Text>
          <Text style={styles.emptyTitle}>No followers yet</Text>
          <Text style={styles.emptySub}>
            You can only add followers to your close friends list.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const isClose = closeFriendIds.has(item.id);
            const isLoading = toggling.has(item.id);
            return (
              <View style={styles.row}>
                <Avatar uri={item.avatar_uri} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.display_name}</Text>
                  <Text style={styles.handle}>@{item.username}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggleBtn, isClose && styles.toggleBtnActive]}
                  onPress={() => toggle(item.id)}
                  disabled={isLoading}
                >
                  {isLoading
                    ? <ActivityIndicator size="small" color={isClose ? '#0d1117' : '#6fe0e6'} />
                    : <Text style={[styles.toggleTxt, isClose && styles.toggleTxtActive]}>
                      {isClose ? '★ Added' : '☆ Add'}
                    </Text>
                  }
                </TouchableOpacity>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#6fe0e6', fontSize: 28, lineHeight: 32 },
  title: { color: '#e2e8f0', fontSize: 18, fontWeight: '700' },
  subtitle: {
    color: '#4a5568', fontSize: 13, paddingHorizontal: 20,
    paddingVertical: 12, lineHeight: 18,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyEmoji: { fontSize: 48, opacity: 0.4 },
  emptyTitle: { color: '#4a5568', fontSize: 17, fontWeight: '600' },
  emptySub: { color: '#374151', fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },

  sectionHeader: {
    backgroundColor: '#0d1117',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  sectionTitle: {
    color: '#4a5568', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  avatarFallback: {
    backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center',
  },
  name: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  handle: { color: '#4a5568', fontSize: 12 },
  toggleBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 16, borderWidth: 1, borderColor: '#6fe0e6',
    minWidth: 80, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#6fe0e6', borderColor: '#6fe0e6' },
  toggleTxt: { color: '#6fe0e6', fontSize: 13, fontWeight: '600' },
  toggleTxtActive: { color: '#0d1117' },
});
