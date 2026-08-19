/**
 * Countries screen — shows all countries the user has cried in with counts.
 * Route: /countries
 */
import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/themes';
import { ListSkeleton } from '../components/Skeleton';
import { useFocusEffect } from 'expo-router';
import { loadCries } from '../lib/storage';
import { countryFlag } from '../lib/geo';

export default function CountriesScreen() {
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const [rows, setRows] = useState<{ code?: string; country: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    loadCries().then(cries => {
      // Keyed by ISO code, labelled by name. The name arrives from the device
      // geocoder in the phone's language, so it is a label and never an
      // identity: grouping on it listed Denmark twice.
      const counts = new Map<string, { code?: string; country: string; count: number }>();
      for (const c of cries) {
        const code = c.countryCode?.trim().toUpperCase();
        const key = code || c.country?.trim();
        if (!key) continue;
        const hit = counts.get(key);
        if (hit) hit.count += 1;
        else counts.set(key, { code, country: c.country?.trim() || key, count: 1 });
      }
      setRows([...counts.values()].sort((a, b) => b.count - a.count));
      setLoading(false);
    });
  }, []));

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Countries</Text>
          {!loading && <Text style={s.subtitle}>{rows.length} {rows.length === 1 ? 'country' : 'countries'}</Text>}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🌍</Text>
          <Text style={s.emptyTitle}>No countries yet</Text>
          <Text style={s.emptySub}>Your cries will appear here once they have location data.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.code ?? r.country}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item, index }) => (
            <View style={s.row}>
              {/* Rank */}
              <Text style={s.rank}>#{index + 1}</Text>

              {/* Flag + name */}
              <Text style={s.flag}>{countryFlag(item.code)}</Text>
              <Text style={s.countryName}>{item.country}</Text>

              {/* Count + bar */}
              <View style={s.right}>
                <Text style={s.count}>{item.count} {item.count === 1 ? 'cry' : 'cries'}</Text>
                <View style={s.barBg}>
                  <View style={[s.bar, { width: `${(item.count / rows[0].count) * 100}%` }]} />
                </View>
              </View>
            </View>
          )}
          ListFooterComponent={<View style={{ height: 32 }} />}
        />
      )}
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
  title: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },
  subtitle: { color: '#4a5568', fontSize: 13, fontFamily: 'monospace' },

  list: { paddingTop: 8 },
  sep: { height: 1, backgroundColor: '#1f2937', marginLeft: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rank: { color: '#374151', fontSize: 13, fontFamily: 'monospace', width: 24, textAlign: 'right' },
  flag: { fontSize: 28 },
  countryName: { color: '#e2e8f0', fontSize: 15, fontWeight: '600', flex: 1 },
  right: { alignItems: 'flex-end', gap: 4, width: 90 },
  count: { color: '#6fe0e6', fontSize: 13, fontFamily: 'monospace' },
  barBg: { width: 80, height: 4, backgroundColor: '#1f2937', borderRadius: 2, overflow: 'hidden' },
  bar: { height: 4, backgroundColor: '#6fe0e6', borderRadius: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 52, opacity: 0.3 },
  emptyTitle: { color: '#4a5568', fontSize: 17, fontWeight: '600' },
  emptySub: { color: '#374151', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
