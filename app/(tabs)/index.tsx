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
  cries: Cry[];
  dominantColor: string;
  dominantEmoji: string;
}

// ─── Clustering ───────────────────────────────────────────────────────────────

function clusterCries(cries: Cry[], longitudeDelta: number): ClusterGroup[] {
  const threshold = longitudeDelta * 0.08;
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
    if (!merged) {
      buckets.push({ lat: cry.latitude, lng: cry.longitude, cries: [cry] });
    }
  }

  return buckets.map(b => {
    const counts: Record<string, number> = {};
    for (const c of b.cries) counts[c.emotion] = (counts[c.emotion] ?? 0) + 1;
    const dominant = Object.entries(counts).sort((a, z) => z[1] - a[1])[0][0];
    const emotion = emotionById(dominant);
    return {
      id: b.cries.map(c => c.id).join('|'),
      latitude: b.lat,
      longitude: b.lng,
      // Sort newest first inside the cluster
      cries: [...b.cries].sort(
        (a, z) => new Date(z.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      dominantColor: emotion?.color ?? '#6fe0e6',
      dominantEmoji: emotion?.emoji ?? '💧',
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
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
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

// ─── Single pin marker ────────────────────────────────────────────────────────

function SinglePin({ color, emoji }: { color: string; emoji: string }) {
  return (
    // collapsable={false} prevents Android from collapsing the view before
    // the native layer captures the bitmap — avoids the clipping bug.
    <View collapsable={false}>
      <View style={[styles.pin, { backgroundColor: color }]}>
        <Text style={styles.pinEmoji}>{emoji}</Text>
      </View>
    </View>
  );
}

// ─── Cluster pin marker ───────────────────────────────────────────────────────
// Uses NESTED circles instead of borderWidth to avoid the Android bitmap-
// clipping bug where borders get cut off on custom Marker views.

function ClusterPin({ color, count }: { color: string; count: number }) {
  return (
    <View collapsable={false}>
      {/* Outer circle = the "ring" colour */}
      <View style={[styles.clusterOuter, { backgroundColor: color }]}>
        {/* Inner circle = dark fill */}
        <View style={styles.clusterInner}>
          <Text style={styles.clusterCount}>{count}</Text>
        </View>
      </View>
    </View>
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
  const [selectedCluster, setSelectedCluster] = useState<ClusterGroup | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);

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
      setCurrentRegion(r);
      setGpsCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setGpsReady(true);
    })();
  }, []);

  // Load cries
  useEffect(() => { loadCries().then(setCries); }, []);
  useFocusEffect(useCallback(() => { loadCries().then(setCries); }, []));

  // Recompute clusters whenever cries or map region changes
  const clusters = useMemo(() => {
    const region = currentRegion ?? initialRegionRef.current;
    if (!region) return [];
    return clusterCries(cries, region.longitudeDelta);
  }, [cries, currentRegion]);

  function handleAddCry() {
    if (!gpsCoords) return;
    router.push({
      pathname: '/log-cry',
      params: { lat: String(gpsCoords.latitude), lng: String(gpsCoords.longitude) },
    });
  }

  function handleMarkerPress(cluster: ClusterGroup) {
    if (cluster.cries.length === 1) {
      setSelectedCry(cluster.cries[0]);
    } else {
      setSelectedCluster(cluster);
    }
  }

  // Close cluster sheet then open single-cry detail (avoid nested modals)
  function handleClusterCryPress(cry: Cry) {
    setSelectedCluster(null);
    setTimeout(() => setSelectedCry(cry), 150);
  }

  // ── Render: permission denied ─────────────────────────────────────────────

  if (permissionDenied) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 48 }}>📍</Text>
        <Text style={styles.errorTitle}>Location needed</Text>
        <Text style={styles.errorSub}>Enable location in Settings to log where you cried.</Text>
      </View>
    );
  }

  // ── Render: GPS loading ───────────────────────────────────────────────────

  if (!gpsReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6fe0e6" />
        <Text style={styles.loadingText}>Finding your location…</Text>
      </View>
    );
  }

  // ── Render: map ───────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegionRef.current!}
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        onRegionChangeComplete={setCurrentRegion}
      >
        {clusters.map(cluster => {
          const isSingle = cluster.cries.length === 1;

          if (isSingle) {
            const cry = cluster.cries[0];
            const emotion = emotionById(cry.emotion);
            const color = emotion?.color ?? '#6fe0e6';
            return (
              <Marker
                key={cluster.id}
                coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => handleMarkerPress(cluster)}
              >
                <SinglePin color={color} emoji={emotion?.emoji ?? '💧'} />
              </Marker>
            );
          }

          return (
            <Marker
              key={cluster.id}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => handleMarkerPress(cluster)}
            >
              <ClusterPin
                color={cluster.dominantColor}
                count={cluster.cries.length}
              />
            </Marker>
          );
        })}
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
      {selectedCluster && (
        <Modal
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedCluster(null)}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setSelectedCluster(null)}
          />
          <SafeAreaView edges={['bottom']} style={[styles.card, styles.clusterCard]}>
            <View style={styles.handle} />

            {/* Sheet header */}
            <View style={styles.clusterHeader}>
              <View style={[styles.clusterBadge, { backgroundColor: selectedCluster.dominantColor + '22' }]}>
                <Text style={styles.clusterBadgeEmoji}>{selectedCluster.dominantEmoji}</Text>
                <Text style={[styles.clusterBadgeLabel, { color: selectedCluster.dominantColor }]}>
                  {selectedCluster.cries.length} cries here
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedCluster(null)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* List of cries in cluster */}
            <FlatList
              data={selectedCluster.cries}
              keyExtractor={c => c.id}
              style={styles.clusterList}
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
                      <Text style={styles.clusterItemDate}>{formatRelative(item.createdAt)}</Text>
                      {item.note ? (
                        <Text style={styles.clusterItemNote} numberOfLines={1}>{item.note}</Text>
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

  // Single pin
  pin: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  pinEmoji: { fontSize: 18 },

  // Cluster pin — nested circles, NO borderWidth (avoids Android bitmap clipping)
  clusterOuter: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  clusterInner: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#0d1117',
    alignItems: 'center', justifyContent: 'center',
  },
  clusterCount: { color: '#e2e8f0', fontSize: 15, fontWeight: '800' },

  // Modals shared
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
  clusterBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  clusterBadgeEmoji: { fontSize: 18 },
  clusterBadgeLabel: { fontSize: 15, fontWeight: '700' },

  clusterList: { maxHeight: 340 },
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
