/**
 * Blocked users.
 *
 * Was a modal inside the Settings tab. Moved to its own route so the Visibility
 * page can link to it like everything else there, and so unblocking someone
 * isn't buried two sheets deep.
 */
import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { getBlockedUsers, unblockUser, BlockedUser } from '../lib/social';
import { SubScreen } from '../components/SettingsRows';

function Avatar({ uri, size = 40 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.42 }}>💧</Text>
    </View>
  );
}

export default function BlockedUsersScreen() {
  const { session } = useAuth();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!session) { setLoading(false); return; }
    getBlockedUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]));

  function confirmUnblock(u: BlockedUser) {
    Alert.alert('Unblock', `Unblock @${u.username}? They'll be able to see and reach you again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          await unblockUser(u.id);
          setUsers(prev => prev.filter(x => x.id !== u.id));
        },
      },
    ]);
  }

  return (
    <SubScreen title="Blocked users">
      {loading ? (
        <View style={s.center}><ActivityIndicator color="#6fe0e6" /></View>
      ) : users.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>🚫</Text>
          <Text style={s.emptyTxt}>You haven't blocked anyone</Text>
          <Text style={s.emptySub}>
            You can block someone from their profile, or straight after reporting them.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={u => u.id}
          contentContainerStyle={{ paddingTop: 8 }}
          renderItem={({ item }) => (
            <View style={s.row}>
              <Avatar uri={item.avatar_uri} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{item.display_name}</Text>
                <Text style={s.handle} numberOfLines={1}>@{item.username}</Text>
              </View>
              <TouchableOpacity style={s.btn} onPress={() => confirmUnblock(item)} activeOpacity={0.8}>
                <Text style={s.btnTxt}>Unblock</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 36, opacity: 0.35 },
  emptyTxt: { color: '#94a3b8', fontSize: 15 },
  emptySub: { color: '#4a5568', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#e2e8f0', fontSize: 15 },
  handle: { color: '#4a5568', fontSize: 13, marginTop: 2 },
  btn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 14, borderWidth: 1, borderColor: '#1f2937',
  },
  btnTxt: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
});
