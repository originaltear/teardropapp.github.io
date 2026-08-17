/**
 * Who liked or hugged a cry.
 *
 * The counts were always visible and the names never were, which made the
 * "Show who reacted" setting a switch with nothing behind it.
 *
 * A hug is not a like here. On a cry about someone's worst night the
 * difference between the two is the whole point, so both are shown per person
 * rather than merged into one number.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, Modal, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getCryReactors, Reactor } from '../lib/social';

function Avatar({ uri, size = 38 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.42 }}>💧</Text>
    </View>
  );
}

export function ReactorsSheet({ cryId, visible, onClose }: {
  cryId: string; visible: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const [people, setPeople] = useState<Reactor[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getCryReactors(cryId)
      .then(setPeople)
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  }, [visible, cryId]);

  function openProfile(id: string) {
    onClose();
    router.push(`/user-profile?id=${id}`);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <SafeAreaView edges={['bottom']}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.headerRow}>
              <Text style={s.title}>Reactions</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Text style={s.close}>✕</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={s.center}><ActivityIndicator color="#6fe0e6" /></View>
            ) : people === null ? (
              <Text style={s.hidden}>
                This person has chosen not to show who reacts to their cries.
              </Text>
            ) : people.length === 0 ? (
              <Text style={s.hidden}>Nobody has reacted yet.</Text>
            ) : (
              <FlatList
                data={people}
                keyExtractor={p => p.id}
                style={{ maxHeight: 380 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.row} onPress={() => openProfile(item.id)} activeOpacity={0.7}>
                    <Avatar uri={item.avatar_uri} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.name} numberOfLines={1}>{item.display_name}</Text>
                      <Text style={s.handle2} numberOfLines={1}>@{item.username}</Text>
                    </View>
                    <Text style={s.marks}>
                      {item.liked ? '💧' : ''}{item.hugged ? '🫂' : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#00000099' },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 10, paddingBottom: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151',
    alignSelf: 'center', marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 8,
  },
  title: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },
  close: { color: '#4a5568', fontSize: 17, padding: 4 },
  center: { paddingVertical: 32, alignItems: 'center' },
  hidden: {
    color: '#4a5568', fontSize: 13, lineHeight: 20,
    paddingHorizontal: 20, paddingVertical: 22, textAlign: 'center',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#e2e8f0', fontSize: 15 },
  handle2: { color: '#4a5568', fontSize: 13, marginTop: 2 },
  marks: { fontSize: 15, letterSpacing: 2 },
});
