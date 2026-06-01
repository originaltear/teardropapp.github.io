import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/themes';
import {
  searchUsers, followUser, unfollowUser, sendFriendRequest,
  respondToFriendRequest, getPendingRequests,
  UserResult, FriendRequest,
} from '../lib/social';

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ uri, size = 44 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.45 }}>💧</Text>
    </View>
  );
}

// ─── User row ─────────────────────────────────────────────────────────────────

function UserRow({ user, onAction }: { user: UserResult; onAction: (u: UserResult, action: string) => void }) {
  const relationLabel: Record<UserResult['relation'], string> = {
    none: 'Follow',
    following: 'Unfollow',
    request_sent: 'Requested',
    request_received: 'Accept',
    self: '',
  };
  const relationStyle: Record<UserResult['relation'], object> = {
    none: styles.btnFollow,
    following: styles.btnFollowing,
    request_sent: styles.btnRequested,
    request_received: styles.btnAccept,
    self: {},
  };

  return (
    <View style={styles.userRow}>
      <Avatar uri={user.avatar_uri} />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.display_name}</Text>
        <Text style={styles.userHandle}>@{user.username}</Text>
      </View>
      {user.relation !== 'self' && (
        <TouchableOpacity
          style={[styles.relationBtn, relationStyle[user.relation]]}
          onPress={() => onAction(user, user.relation)}
          activeOpacity={0.75}
        >
          <Text style={styles.relationTxt}>{relationLabel[user.relation]}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Request row ──────────────────────────────────────────────────────────────

function RequestRow({ req, onRespond }: {
  req: FriendRequest;
  onRespond: (id: string, action: 'accepted' | 'rejected') => void;
}) {
  const p = req.from_profile;
  return (
    <View style={styles.userRow}>
      <Avatar uri={p?.avatar_uri} />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{p?.display_name ?? 'Unknown'}</Text>
        <Text style={styles.userHandle}>@{p?.username ?? '?'}</Text>
        <Text style={styles.reqLabel}>Sent you a friend request</Text>
      </View>
      <View style={styles.reqActions}>
        <TouchableOpacity style={styles.btnAccept} onPress={() => onRespond(req.id, 'accepted')} activeOpacity={0.8}>
          <Text style={styles.relationTxt}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnReject} onPress={() => onRespond(req.id, 'rejected')} activeOpacity={0.8}>
          <Text style={styles.rejectTxt}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [tab, setTab] = useState<'search' | 'requests'>('search');

  useEffect(() => {
    getPendingRequests().then(setPendingRequests);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchUsers(query);
      setResults(r);
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const handleAction = useCallback(async (user: UserResult, relation: string) => {
    if (relation === 'none') {
      await followUser(user.id);
      setResults(prev => prev.map(u => u.id === user.id ? { ...u, relation: 'following' } : u));
    } else if (relation === 'following') {
      Alert.alert('Unfollow', `Unfollow @${user.username}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow', style: 'destructive', onPress: async () => {
            await unfollowUser(user.id);
            setResults(prev => prev.map(u => u.id === user.id ? { ...u, relation: 'none' } : u));
          },
        },
      ]);
    } else if (relation === 'request_received') {
      // Find request id
      const req = pendingRequests.find(r => r.from_user_id === user.id);
      if (req) {
        await respondToFriendRequest(req.id, 'accepted');
        setResults(prev => prev.map(u => u.id === user.id ? { ...u, relation: 'following' } : u));
        setPendingRequests(prev => prev.filter(r => r.id !== req.id));
      }
    }
  }, [pendingRequests]);

  const handleRespond = useCallback(async (id: string, action: 'accepted' | 'rejected') => {
    await respondToFriendRequest(id, action);
    setPendingRequests(prev => prev.filter(r => r.id !== id));
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Find Friends</Text>
        {pendingRequests.length > 0 && (
          <TouchableOpacity onPress={() => setTab(t => t === 'requests' ? 'search' : 'requests')}>
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>{pendingRequests.length}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['search', 'requests'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
              {t === 'search' ? 'Search' : `Requests${pendingRequests.length ? ` (${pendingRequests.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'search' ? (
        <>
          {/* Search input */}
          <View style={styles.searchRow}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by username…"
              placeholderTextColor="#4a5568"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching && <ActivityIndicator size="small" color={accent} />}
          </View>

          <FlatList
            data={results}
            keyExtractor={u => u.id}
            renderItem={({ item }) => <UserRow user={item} onAction={handleAction} />}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            contentContainerStyle={results.length === 0 ? styles.emptyContainer : undefined}
            ListEmptyComponent={
              query.trim() && !searching ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>🔍</Text>
                  <Text style={styles.emptyTxt}>No users found for "@{query}"</Text>
                </View>
              ) : !query ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>👥</Text>
                  <Text style={styles.emptyTxt}>Search for friends by username</Text>
                </View>
              ) : null
            }
          />
        </>
      ) : (
        <FlatList
          data={pendingRequests}
          keyExtractor={r => r.id}
          renderItem={({ item }) => <RequestRow req={item} onRespond={handleRespond} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={pendingRequests.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>✉️</Text>
              <Text style={styles.emptyTxt}>No pending friend requests</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#6fe0e6', fontSize: 22 },
  title: { flex: 1, color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  badge: {
    backgroundColor: '#6fe0e6', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3, minWidth: 24, alignItems: 'center',
  },
  badgeTxt: { color: '#0d1117', fontSize: 12, fontWeight: '700' },

  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#1f2937' },
  tabActive: { backgroundColor: '#6fe0e6', borderColor: '#6fe0e6' },
  tabTxt: { color: '#4a5568', fontSize: 13, fontWeight: '600' },
  tabTxtActive: { color: '#0d1117' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#111827', borderRadius: 12,
    borderWidth: 1, borderColor: '#1f2937',
    paddingHorizontal: 14,
  },
  atSign: { color: '#6fe0e6', fontSize: 16, fontWeight: '700' },
  searchInput: { flex: 1, color: '#e2e8f0', fontSize: 15, paddingVertical: 12 },

  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  userInfo: { flex: 1 },
  userName: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  userHandle: { color: '#4a5568', fontSize: 13 },
  reqLabel: { color: '#6fe0e6', fontSize: 12, marginTop: 2 },

  relationBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  btnFollow: { backgroundColor: '#6fe0e6' },
  btnFollowing: { backgroundColor: '#ef444422', borderWidth: 1, borderColor: '#ef4444' },
  btnRequested: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#374151' },
  btnAccept: { backgroundColor: '#6fe0e6', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  btnReject: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  relationTxt: { color: '#0d1117', fontSize: 13, fontWeight: '700' },
  relationTxtUnfollow: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  rejectTxt: { color: '#4a5568', fontSize: 14 },

  reqActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sep: { height: 1, backgroundColor: '#1f2937', marginLeft: 72 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, padding: 40 },
  emptyEmoji: { fontSize: 40, opacity: 0.5 },
  emptyTxt: { color: '#4a5568', fontSize: 14, textAlign: 'center' },
});
