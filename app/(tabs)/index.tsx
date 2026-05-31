import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet, View, TouchableOpacity, Text,
  ActivityIndicator, Modal, FlatList,
} from 'react-native';
// ─── react-native-map-clustering wraps MapView and handles all clustering ───
import ClusterMapView from 'react-native-map-clustering';
import { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { loadCries, Cry } from '../../lib/storage';
import { emotionById } from '../../lib/emotions';

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
  const initialRegionRef = useRef<Region | null>(null);

  const [gpsReady, setGpsReady] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cries, setCries] = useState<Cry[]>([]);
  const [selectedCry, setSelectedCry] = useState<Cry | null>(null);
  const [clusterList, setClusterList] = useState<Cry[] | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // GPS init
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setPermissionDenied(true); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      initialRegionRef.current = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      setGpsCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setGpsReady(true);
    })();
  }, []);

  // Load cries on mount and whenever the tab gains focus
  useEffect(() => { loadCries().then(setCries); }, []);
  useFocusEffect(useCallback(() => { loadCries().then(setCries); }, []));

  function handleAddCry() {
    if (!gpsCoords) return;
    router.push({
      pathname: '/log-cry',
      params: { lat: String(gpsCoords.latitude), lng: String(gpsCoords.longitude) },
    });
  }

  // Cluster press: show list of cries inside the cluster
  function handleClusterPress(_cluster: unknown, leaves?: unknown[]) {
    const ids = new Set((leaves ?? []).map((l: any) => l.properties?.identifier));
    const list = cries
      .filter(c => ids.has(c.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (list.length > 0) setClusterList(list);
  }

  // Close cluster list, then open single-cry detail (avoid stacking modals)
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
      {/*
        ClusterMapView wraps react-native-maps MapView and clusters markers
        automatically via supercluster. All standard MapView props pass through.

        preserveClusterPressBehavior — keeps our custom onClusterPress in charge;
          the library will not auto-zoom/fit the map on cluster tap.
        clusterColor / clusterTextColor — used by the default cluster marker (kept
          as fallback; we override with renderCluster below).
      */}
      <ClusterMapView
        style={styles.map}
        initialRegion={initialRegionRef.current!}
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        preserveClusterPressBehavior
        clusterColor="#6fe0e6"
        clusterTextColor="#0d1117"
        onClusterPress={handleClusterPress}
        renderCluster={(cluster: any) => {
          /*
           * Custom cluster pin — same flat-circle structure as the working
           * single pins. No borderWidth, no position:absolute layers,
           * just a single colored View with a Text child.
           * collapsable={false} prevents Android from collapsing the view
           * hierarchy before the native bitmap is captured.
           */
          const { onPress, geometry, properties } = cluster;
          const count: number = properties.point_count;
          return (
            <Marker
              key={`cluster-${cluster.id}`}
              coordinate={{
                latitude: geometry.coordinates[1],
                longitude: geometry.coordinates[0],
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={onPress}
            >
              <View collapsable={false}>
                <View style={styles.clusterPin}>
                  <Text style={styles.clusterPinText}>{count}</Text>
                </View>
              </View>
            </Marker>
          );
        }}
      >
        {/* Individual cry markers */}
        {cries.map(cry => {
          const emotion = emotionById(cry.emotion);
          const color = emotion?.color ?? '#6fe0e6';
          return (
            <Marker
              key={cry.id}
              identifier={cry.id}           // stored in GeoJSON → used by onClusterPress
              coordinate={{ latitude: cry.latitude, longitude: cry.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => setSelectedCry(cry)}
            >
              <View collapsable={false}>
                <View style={[styles.pin, { backgroundColor: color }]}>
                  <Text style={styles.pinEmoji}>{emotion?.emoji ?? '💧'}</Text>
                </View>
              </View>
            </Marker>
          );
        })}
      </ClusterMapView>

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
                {clusterList.length} cries here
              </Text>
              <TouchableOpacity
                onPress={() => setClusterList(null)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={clusterList}
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

  // Single cry pin — flat circle, NO borders
  pin: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  pinEmoji: { fontSize: 18 },

  // Cluster pin — same flat-circle structure as single pin, just larger + number
  clusterPin: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#6fe0e6',
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
  clusterHeaderTitle: {
    color: '#6fe0e6', fontSize: 16, fontWeight: '700',
  },

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
