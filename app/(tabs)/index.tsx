import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, View, TouchableOpacity, Text,
  ActivityIndicator, Modal, FlatList,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { loadCries, Cry } from '../../lib/storage';
import { emotionById } from '../../lib/emotions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClusterGroup {
  id: string;
  latitude: number;
  longitude: number;
  cries: Cry[];           // sorted newest-first
  dominantColor: string;
}

// ─── Clustering (own logic, full control) ───────────────────────────────────────

function clusterCries(cries: Cry[], longitudeDelta: number): ClusterGroup[] {
  // Merge cries whose lat/lng are within ~8% of the visible span of each other.
  const threshold = Math.max(longitudeDelta * 0.08, 0.00005);
  const buckets: { lat: number; lng: number; cries: Cry[] }[] = [];

  for (const cry of cries) {
    let merged = false;
    for (const bucket of buckets) {
      if (
        Math.abs(cry.latitude - bucket.lat) < threshold &&
        Math.abs(cry.longitude - bucket.lng) < threshold
      ) {
        bucket.cries.push(cry);
        bucket.lat = bucket.cries.reduce((s, c) => s + c.latitude, 0) / bucket.cries.length;
        bucket.lng = bucket.cries.reduce((s, c) => s + c.longitude, 0) / bucket.cries.length;
        merged = true;
        break;
      }
    }
    if (!merged) buckets.push({ lat: cry.latitude, lng: cry.longitude, cries: [cry] });
  }

  return buckets.map(b => {
    const counts: Record<string, number> = {};
    for (const c of b.cries) counts[c.emotion] = (counts[c.emotion] ?? 0) + 1;
    const dominant = Object.entries(counts).sort((a, z) => z[1] - a[1])[0][0];
    return {
      id: b.cries.map(c => c.id).sort().join('|'),
      latitude: b.lat,
      longitude: b.lng,
      cries: [...b.cries].sort(
        (a, z) => new Date(z.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      dominantColor: emotionById(dominant)?.color ?? '#6fe0e6',
    };
  });
}

// ─── Map style ────────────────────────────────────────────────────────────────

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a2233' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8fa8b8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3040' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#152030' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1a2535' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#0e2019' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#253247' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a2030' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c3e5e' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1a2535' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#0a1628' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d778d' }] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function Drops({ intensity }: { intensity: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: 16, opacity: n <= intensity ? 1 : 0.2 }}>💧</Text>
      ))}
    </View>
  );
}

// ─── Android bitmap-capture fix ─────────────────────────────────────────────────
// react-native-maps rasterises custom markers to a bitmap. If it captures BEFORE
// the view has laid out, the bitmap is too small and round shapes get clipped to
// a square. Keeping tracksViewChanges=true until after layout fixes this; we then
// flip to false so the markers don't keep re-rendering every frame.
function useSettleTracking() {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setTracks(false), 600);
    return () => clearTimeout(id);
  }, []);
  return tracks;
}

// ─── Single cry marker ──────────────────────────────────────────────────────────

function CryMarker({ cry, onPress }: { cry: Cry; onPress: () => void }) {
  const tracks = useSettleTracking();
  const emotion = emotionById(cry.emotion);
  const color = emotion?.color ?? '#6fe0e6';
  return (
    <Marker
      coordinate={{ latitude: cry.latitude, longitude: cry.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={onPress}
      tracksViewChanges={tracks}
    >
      <View style={[styles.pin, { backgroundColor: color }]}>
        <Text style={styles.pinEmoji}>{emotion?.emoji ?? '💧'}</Text>
      </View>
    </Marker>
  );
}

// ─── Cluster marker ──────────────────────────────────────────────────────────────

function ClusterMarker({ cluster, onPress }: { cluster: ClusterGroup; onPress: () => void }) {
  const tracks = useSettleTracking();
  return (
    <Marker
      coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={onPress}
      tracksViewChanges={tracks}
    >
      <View style={[styles.clusterPin, { backgroundColor: cluster.dominantColor }]}>
        <Text style={styles.clusterPinText}>{cluster.cries.length}</Text>
      </View>
    </Marker>
  );
}

// ─── Cry detail card ──────────────────────────────────────────────────────────

function CryDetailCard({ cry, onClose }: { cry: Cry; onClose: () => void }) {
  const emotion = emotionById(cry.emotion);
  return (
    <>
      <View style={styles.handle} />
      <View style={styles.cardHeader}>
        <View style={[styles.emotionBadge, { backgroundColor: (emotion?.color ?? '#6fe0e6') + '22' }]}>
          <Text style={styles.badgeEmoji}>{emotion?.emoji ?? '💧'}</Text>
          <Text style={[styles.badgeLabel, { color: emotion?.color ?? '#6fe0e6' }]}>
            {emotion?.label ?? cry.emotion}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.dateText}>{formatDate(cry.createdAt)}</Text>
      <Drops intensity={cry.intensity} />
      {cry.note ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>{cry.note}</Text>
        </View>
      ) : (
        <Text style={styles.noNote}>No note</Text>
      )}
    </>
  );
}

// ─── Map screen ───────────────────────────────────────────────────────────────

export default function MapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const initialRegionRef = useRef<Region | null>(null);

  const [gpsReady, setGpsReady] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cries, setCries] = useState<Cry[]>([]);
  const [selectedCry, setSelectedCry] = useState<Cry | null>(null);
  const [clusterList, setClusterList] = useState<ClusterGroup | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);

  // GPS init
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setPermissionDenied(true); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const r: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      initialRegionRef.current = r;
      setRegion(r);
      setGpsCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setGpsReady(true);
    })();
  }, []);

  // Load cries on mount and on focus
  useEffect(() => { loadCries().then(setCries); }, []);
  useFocusEffect(useCallback(() => { loadCries().then(setCries); }, []));

  // Recompute clusters when cries or zoom level change
  const clusters = useMemo(() => {
    const r = region ?? initialRegionRef.current;
    if (!r) return [];
    return clusterCries(cries, r.longitudeDelta);
  }, [cries, region]);

  function handleAddCry() {
    if (!gpsCoords) return;
    router.push({
      pathname: '/log-cry',
      params: { lat: String(gpsCoords.latitude), lng: String(gpsCoords.longitude) },
    });
  }

  function handleClusterPress(cluster: ClusterGroup) {
    if (cluster.cries.length === 1) setSelectedCry(cluster.cries[0]);
    else setClusterList(cluster);
  }

  function handleClusterCryPress(cry: Cry) {
    setClusterList(null);
    setTimeout(() => setSelectedCry(cry), 150);
  }

  // ─── Permission denied ────────────────────────────────────────────────────

  if (permissionDenied) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 48 }}>📍</Text>
        <Text style={styles.errorTitle}>Location needed</Text>
        <Text style={styles.errorSub}>Enable location in Settings to log where you cried.</Text>
      </View>
    );
  }

  // ─── GPS loading ──────────────────────────────────────────────────────────

  if (!gpsReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6fe0e6" />
        <Text style={styles.loadingText}>Finding your location…</Text>
      </View>
    );
  }

  // ─── Map ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegionRef.current!}
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        onRegionChangeComplete={setRegion}
      >
        {clusters.map(cluster =>
          cluster.cries.length === 1 ? (
            <CryMarker
              key={cluster.id}
              cry={cluster.cries[0]}
              onPress={() => setSelectedCry(cluster.cries[0])}
            />
          ) : (
            <ClusterMarker
              key={cluster.id}
              cluster={cluster}
              onPress={() => handleClusterPress(cluster)}
            />
          )
        )}
      </MapView>

      {/* Header overlay */}
      <SafeAreaView edges={['top']} style={styles.header} pointerEvents="none">
        <Text style={styles.headerTitle}>💧 Teardrop</Text>
      </SafeAreaView>

      {/* FAB */}
      <SafeAreaView edges={['bottom']} style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={handleAddCry} activeOpacity={0.85}>
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── Single cry detail modal ───────────────────────────────────────── */}
      {selectedCry && (
        <Modal
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedCry(null)}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setSelectedCry(null)}
          />
          <SafeAreaView edges={['bottom']} style={styles.card}>
            <CryDetailCard cry={selectedCry} onClose={() => setSelectedCry(null)} />
          </SafeAreaView>
        </Modal>
      )}

      {/* ── Cluster list modal ────────────────────────────────────────────── */}
      {clusterList && (
        <Modal
          transparent
          animationType="slide"
          onRequestClose={() => setClusterList(null)}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setClusterList(null)}
          />
          <SafeAreaView edges={['bottom']} style={[styles.card, styles.clusterCard]}>
            <View style={styles.handle} />

            <View style={styles.clusterHeader}>
              <Text style={styles.clusterHeaderTitle}>
                {clusterList.cries.length} cries here
              </Text>
              <TouchableOpacity
                onPress={() => setClusterList(null)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={clusterList.cries}
              keyExtractor={c => c.id}
              style={styles.clusterFlatList}
              ItemSeparatorComponent={() => <View style={styles.itemSep} />}
              renderItem={({ item }) => {
                const emotion = emotionById(item.emotion);
                const color = emotion?.color ?? '#6fe0e6';
                return (
                  <TouchableOpacity
                    style={styles.clusterItem}
                    onPress={() => handleClusterCryPress(item)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.clusterItemDot, { backgroundColor: color }]}>
                      <Text style={styles.clusterItemEmoji}>{emotion?.emoji ?? '💧'}</Text>
                    </View>
                    <View style={styles.clusterItemContent}>
                      <Text style={[styles.clusterItemEmotion, { color }]}>
                        {emotion?.label ?? item.emotion}
                      </Text>
                      <Text style={styles.clusterItemDate}>
                        {formatRelative(item.createdAt)}
                      </Text>
                      {item.note ? (
                        <Text style={styles.clusterItemNote} numberOfLines={1}>
                          {item.note}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.clusterItemArrow}>›</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  map: { flex: 1 },

  center: {
    flex: 1, backgroundColor: '#0d1117',
    alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 40,
  },
  loadingText: { color: '#4a5568', fontSize: 14, marginTop: 12, fontFamily: 'monospace' },
  errorTitle: { color: '#6fe0e6', fontSize: 18, fontWeight: '600' },
  errorSub: { color: '#4a5568', fontSize: 14, textAlign: 'center' },

  // Header
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerTitle: {
    color: '#6fe0e6', fontSize: 18, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    backgroundColor: 'rgba(13,17,23,0.7)',
  },

  // FAB
  fabContainer: { position: 'absolute', bottom: 0, right: 0, alignItems: 'flex-end' },
  fab: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#6fe0e6',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 24, marginBottom: 24,
    shadowColor: '#6fe0e6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabIcon: { fontSize: 32, color: '#0d1117', lineHeight: 36, fontWeight: '300' },

  // Single cry pin — plain circle, no border
  pin: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  pinEmoji: { fontSize: 18 },

  // Cluster pin — plain circle with count, no border
  clusterPin: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  clusterPinText: { color: '#0d1117', fontSize: 16, fontWeight: '800' },

  // Shared modal pieces
  backdrop: { flex: 1 },
  card: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingTop: 12,
    borderTopWidth: 1, borderColor: '#1f2937',
    gap: 14,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#374151', alignSelf: 'center', marginBottom: 4,
  },

  // Single cry card
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emotionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  badgeEmoji: { fontSize: 20 },
  badgeLabel: { fontSize: 16, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#4a5568', fontSize: 18 },
  dateText: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace' },
  noteBox: {
    backgroundColor: '#0d1117', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#1f2937',
  },
  noteText: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  noNote: { color: '#374151', fontSize: 13, fontFamily: 'monospace' },

  // Cluster list modal
  clusterCard: { paddingBottom: 8 },
  clusterHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  clusterHeaderTitle: { color: '#6fe0e6', fontSize: 16, fontWeight: '700' },

  clusterFlatList: { maxHeight: 340 },
  itemSep: { height: 1, backgroundColor: '#1f2937' },

  clusterItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4, gap: 12,
  },
  clusterItemDot: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  clusterItemEmoji: { fontSize: 20 },
  clusterItemContent: { flex: 1, gap: 3 },
  clusterItemEmotion: { fontSize: 14, fontWeight: '600' },
  clusterItemDate: { color: '#4a5568', fontSize: 12, fontFamily: 'monospace' },
  clusterItemNote: { color: '#64748b', fontSize: 13 },
  clusterItemArrow: { color: '#4a5568', fontSize: 24, fontWeight: '300' },
});
