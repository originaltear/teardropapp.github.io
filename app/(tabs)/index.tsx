import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, View, TouchableOpacity, Text,
  ActivityIndicator, Modal, FlatList, Dimensions, Alert, Linking,
} from 'react-native';
import MapView, { Region } from 'react-native-maps';
import Supercluster from 'supercluster';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { loadCries, Cry } from '../../lib/storage';
import { emotionById } from '../../lib/emotions';
import { getMapCries, MapFilter, SocialCry } from '../../lib/social';
import { useAuth } from '../../lib/auth';
import { TearsBadge } from '../../components/TearsBadge';
import { EmotionPin, ClusterPin, LocationDot } from '../../components/MapMarkers';
import { useSplashGate } from '../../components/AppSplash';
import { PressableScale } from '../../components/PressableScale';
import { Avatar } from '../../components/Avatar';
import { Drops } from '../../components/Drops';
import { AudioPlayer } from '../../components/AudioPlayer';
import { CryPhoto } from '../../components/CryPhoto';
import { fullDateTime, timeAgo } from '../../lib/format';
import { tapLight, tapMedium, selection } from '../../lib/haptics';
import { useTheme } from '../../lib/themes';

// ─── Normalize Cry | SocialCry → common shape ─────────────────────────────────

interface NormalizedCry {
  id: string;
  userId?: string;
  date: string;
  emotion: string;
  intensity: number;
  note?: string;
  photoUri?: string;
  audioUri?: string;
  latitude: number;
  longitude: number;
  profile?: { display_name: string; username: string; avatar_uri: string | null; selected_tears?: string[] };
}

function normalizeCry(c: Cry | SocialCry): NormalizedCry {
  const sc = c as SocialCry;
  const lc = c as Cry;
  return {
    id:        c.id,
    userId:    sc.user_id,
    date:      sc.created_at ?? lc.createdAt ?? '',
    emotion:   c.emotion,
    intensity: c.intensity,
    note:      sc.note ?? lc.note,
    photoUri:  sc.photo_uri ?? lc.photoUri,
    audioUri:  sc.audio_uri ?? lc.audioUri,
    latitude:  c.latitude,
    longitude: c.longitude,
    profile:   sc.profile,
  };
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

// ─── Cry detail card ──────────────────────────────────────────────────────────

function CryDetailCard({ cry: rawCry, onClose }: { cry: Cry | SocialCry; onClose: () => void }) {
  const cry = normalizeCry(rawCry);
  const emotion = emotionById(cry.emotion);
  const hasProfile = !!cry.profile;
  const router = useRouter();

  return (
    <>
      <View style={styles.handle} />

      {/* Profile row — tappable to open their profile */}
      {hasProfile && (
        <TouchableOpacity
          style={styles.profileRow}
          activeOpacity={0.75}
          onPress={() => cry.userId && router.push(`/user-profile?id=${cry.userId}`)}
        >
          <Avatar uri={cry.profile!.avatar_uri} size={38} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{cry.profile!.display_name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.profileHandle}>@{cry.profile!.username}</Text>
              {cry.profile!.selected_tears && cry.profile!.selected_tears.length > 0 && (
                <TearsBadge tears={cry.profile!.selected_tears} />
              )}
            </View>
          </View>
          <Text style={styles.profileArrow}>›</Text>
        </TouchableOpacity>
      )}

      <View style={styles.cardHeader}>
        <View style={[styles.emotionBadge, { backgroundColor: (emotion?.color ?? '#6fe0e6') + '22' }]}>
          <Text style={styles.badgeEmoji}>{emotion?.emoji ?? '💧'}</Text>
          <Text style={[styles.badgeLabel, { color: emotion?.color ?? '#6fe0e6' }]}>
            {emotion?.label ?? cry.emotion}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.dateText}>{fullDateTime(cry.date)}</Text>
      <Drops intensity={cry.intensity} />

      {cry.photoUri ? (
        <CryPhoto uri={cry.photoUri} style={styles.photo} />
      ) : null}

      {cry.note ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>{cry.note}</Text>
        </View>
      ) : (
        <Text style={styles.noNote}>No note</Text>
      )}

      {cry.audioUri ? <AudioPlayer uri={cry.audioUri} /> : null}
    </>
  );
}

// ─── Cluster contents: one row per cry inside a tapped cluster ─────────────────

// Cap the scrollable list so the sheet never covers the whole screen.
const CLUSTER_LIST_MAX_H = Dimensions.get('window').height * 0.55;

function ClusterRow({ cry: rawCry, onPress }: { cry: Cry | SocialCry; onPress: () => void }) {
  const cry = normalizeCry(rawCry);
  const emotion = emotionById(cry.emotion);
  const color = emotion?.color ?? '#6fe0e6';
  return (
    <TouchableOpacity style={styles.clRow} onPress={onPress} activeOpacity={0.7}>
      {cry.profile ? <Avatar uri={cry.profile.avatar_uri} size={38} /> : null}
      <View style={{ flex: 1, gap: 4 }}>
        {cry.profile ? (
          <Text style={styles.clUser} numberOfLines={1}>
            {cry.profile.display_name} <Text style={styles.clHandle}>@{cry.profile.username}</Text>
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[styles.clEmotion, { color, backgroundColor: color + '22' }]}>
            {emotion?.emoji} {emotion?.label ?? cry.emotion}
          </Text>
          <Drops intensity={cry.intensity} size={11} />
          {cry.photoUri ? <Text style={{ fontSize: 11 }}>📷</Text> : null}
          {cry.audioUri ? <Text style={{ fontSize: 11 }}>🎙</Text> : null}
        </View>
        {cry.note ? <Text style={styles.clNote} numberOfLines={1}>{cry.note}</Text> : null}
        <Text style={styles.clDate}>{timeAgo(cry.date)}</Text>
      </View>
      <Text style={styles.clArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Map screen ───────────────────────────────────────────────────────────────

export default function MapScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { theme: { accent } } = useTheme();
  const { markMapReady } = useSplashGate();
  const mapRef = useRef<MapView>(null);
  const initialRegionRef = useRef<Region | null>(null);
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cries, setCries] = useState<(Cry | SocialCry)[]>([]);
  const [selectedCry, setSelectedCry] = useState<Cry | SocialCry | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [mapFilter, setMapFilter] = useState<MapFilter>('mine');
  // Current visible region — drives which clusters are computed
  const [region, setRegion] = useState<Region | null>(null);
  // The cluster the user tapped — drives the "cries in this cluster" sheet
  const [clusterView, setClusterView] = useState<{
    cries: (Cry | SocialCry)[]; clusterId: number; lng: number; lat: number;
  } | null>(null);

  useEffect(() => {
    const applyCoords = (latitude: number, longitude: number) => {
      if (!initialRegionRef.current) {
        const r: Region = { latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 };
        initialRegionRef.current = r;
        setRegion(r);
      }
      setGpsCoords({ latitude, longitude });
      setGpsReady(true);
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setPermissionDenied(true); return; }

        // 1. Last known position is instant (no GPS round-trip) — get the map
        //    on screen immediately and refine with the live fix below.
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last) applyCoords(last.coords.latitude, last.coords.longitude);

        // 2. Live fix, bounded so a cold GPS / indoor user is never stuck on
        //    the spinner forever.
        const live = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>(res => setTimeout(() => res(null), 12000)),
        ]).catch(() => null);
        if (live) {
          applyCoords(live.coords.latitude, live.coords.longitude);
        } else if (!last) {
          // No fix at all — show the map zoomed out rather than blocking the
          // whole tab. Logging still requires coordinates (FAB explains).
          initialRegionRef.current = { latitude: 20, longitude: 0, latitudeDelta: 100, longitudeDelta: 100 };
          setRegion(initialRegionRef.current);
          setGpsReady(true);
        }
      } catch (e) {
        console.warn('[map] location failed:', e);
        if (!initialRegionRef.current) {
          initialRegionRef.current = { latitude: 20, longitude: 0, latitudeDelta: 100, longitudeDelta: 100 };
          setRegion(initialRegionRef.current);
        }
        setGpsReady(true);
      } finally {
        // Tell the splash the map is ready (resolved one way or another) so the
        // loading bar can complete and the splash can fade out.
        markMapReady();
      }
    })();
  }, [markMapReady]);

  useFocusEffect(useCallback(() => {
    const onErr = (e: unknown) => console.warn('[map] load cries failed:', e);
    if (session && mapFilter !== 'mine') {
      getMapCries(mapFilter).then(setCries).catch(onErr);
    } else {
      loadCries().then(setCries).catch(onErr);
    }
  }, [session, mapFilter]));

  function handleAddCry() {
    if (!gpsCoords) {
      Alert.alert(
        'Location unavailable',
        "We couldn't get your position. Make sure GPS is turned on, then try again.",
      );
      return;
    }
    router.push({
      pathname: '/log-cry',
      params: { lat: String(gpsCoords.latitude), lng: String(gpsCoords.longitude) },
    });
  }

  // ─── Clustering (supercluster — pure JS, no native marker wrapping) ─────────
  type PointProps = { cry: Cry | SocialCry };

  const superIndex = useMemo(() => {
    const index = new Supercluster<PointProps>({
      radius: 48,      // px distance at which points merge
      maxZoom: 18,     // stop clustering past this zoom
      minPoints: 2,    // need ≥2 points to form a cluster
    });
    index.load(
      cries
        .filter(c => c.latitude && c.longitude)
        .map(c => ({
          type: 'Feature' as const,
          properties: { cry: c },
          geometry: { type: 'Point' as const, coordinates: [c.longitude, c.latitude] },
        })),
    );
    return index;
  }, [cries]);

  const clusters = useMemo(() => {
    if (!region) return [];
    const bbox: [number, number, number, number] = [
      region.longitude - region.longitudeDelta / 2,
      region.latitude - region.latitudeDelta / 2,
      region.longitude + region.longitudeDelta / 2,
      region.latitude + region.latitudeDelta / 2,
    ];
    const zoom = Math.round(Math.log2(360 / Math.max(region.longitudeDelta, 0.0001)));
    return superIndex.getClusters(bbox, Math.min(Math.max(zoom, 0), 20));
  }, [superIndex, region]);

  // Tapping a cluster opens a sheet listing every cry inside it (its "leaves").
  const handleClusterPress = useCallback((clusterId: number, lng: number, lat: number) => {
    tapLight();
    try {
      const leaves = superIndex.getLeaves(clusterId, Infinity);
      const list = leaves.map(l => (l.properties as PointProps).cry);
      setClusterView({ cries: list, clusterId, lng, lat });
    } catch { /* ignore */ }
  }, [superIndex]);

  // "Zoom in" from the sheet — spread the cluster out to where it breaks apart.
  const zoomToCluster = useCallback((clusterId: number, lng: number, lat: number) => {
    setClusterView(null);
    try {
      // Cap zoom so a cluster of points at (nearly) the same spot doesn't shoot
      // the camera to an extreme street-level zoom showing nothing.
      const zoom = Math.min(superIndex.getClusterExpansionZoom(clusterId), 16);
      const delta = 360 / Math.pow(2, zoom);
      mapRef.current?.animateToRegion(
        { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta },
        350,
      );
    } catch { /* ignore */ }
  }, [superIndex]);

  if (permissionDenied) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 48 }}>📍</Text>
        <Text style={styles.errorTitle}>Location needed</Text>
        <Text style={styles.errorSub}>Enable location in Settings to log where you cried.</Text>
        <TouchableOpacity
          style={[styles.settingsBtn, { backgroundColor: accent }]}
          onPress={() => Linking.openSettings()}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open app settings"
        >
          <Text style={styles.settingsBtnTxt}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!gpsReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={accent} />
        <Text style={styles.loadingText}>Finding your location…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegionRef.current!}
        customMapStyle={DARK_MAP_STYLE}
        // Google's default location UI (blue dot + large accuracy circle) sits on
        // top of the markers and covers a cluster's count when you're standing at
        // your own cries. Hidden for a clean, branded map — the map still centres
        // on the user via initialRegion and the FAB uses live GPS.
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onRegionChangeComplete={setRegion}
      >
        {/* Lightweight "you are here" dot (rendered under cry markers) */}
        {gpsCoords && (
          <LocationDot
            latitude={gpsCoords.latitude}
            longitude={gpsCoords.longitude}
            color={accent}
          />
        )}

        {/* Clusters + individual pins. RLS + getGlobalFeed() already filter
            is_public and blocks, so no client-side filtering needed here. */}
        {clusters.map(feature => {
          const [lng, lat] = feature.geometry.coordinates;
          const props = feature.properties as any;
          if (props.cluster) {
            return (
              <ClusterPin
                key={`cluster-${props.cluster_id}`}
                latitude={lat}
                longitude={lng}
                count={props.point_count}
                onPress={() => handleClusterPress(props.cluster_id, lng, lat)}
              />
            );
          }
          const cry = props.cry as Cry | SocialCry;
          return (
            <EmotionPin
              key={`cry-${cry.id}`}
              latitude={lat}
              longitude={lng}
              emotion={cry.emotion}
              onPress={() => setSelectedCry(cry)}
            />
          );
        })}
      </MapView>

      {/* Header title */}
      <SafeAreaView edges={['top']} style={styles.headerOverlay} pointerEvents="none">
        <Text style={[styles.headerTitle, { color: accent }]}>💧 Teardrop</Text>
      </SafeAreaView>

      {/* Segmented filter — centered, floating above FAB */}
      {session && (
        <View style={styles.filterContainer} pointerEvents="box-none">
          <View style={styles.segmented}>
            {(['mine', 'following', 'global'] as MapFilter[]).map((f, i) => {
              const active = mapFilter === f;
              return (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.segment,
                    active && { backgroundColor: accent },
                    i < 2 && styles.segmentBorder,
                  ]}
                  onPress={() => { if (!active) { selection(); setMapFilter(f); } }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={f === 'mine' ? 'Show my cries' : f === 'following' ? "Show friends' cries" : 'Show all cries'}
                >
                  <Text style={styles.segmentEmoji}>
                    {f === 'mine' ? '👤' : f === 'following' ? '👥' : '🌍'}
                  </Text>
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                    {f === 'mine' ? 'Mine' : f === 'following' ? 'Friends' : 'All'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* First-cry nudge for new users with an empty map (own cries only —
          the message makes no sense on the Friends/All filters) */}
      {gpsReady && cries.length === 0 && mapFilter === 'mine' && (
        <SafeAreaView edges={['bottom']} style={styles.hintContainer} pointerEvents="none">
          <View style={styles.firstCryHint}>
            <Text style={styles.firstCryHintTxt}>💧 Tap + to log your first cry</Text>
          </View>
        </SafeAreaView>
      )}

      <SafeAreaView edges={['bottom']} style={styles.fabContainer}>
        <PressableScale
          style={[styles.fab, { backgroundColor: accent, shadowColor: accent }]}
          onPress={() => { tapMedium(); handleAddCry(); }}
          scaleTo={0.88}
          accessibilityRole="button"
          accessibilityLabel="Log a cry"
        >
          <Text style={styles.fabIcon}>+</Text>
        </PressableScale>
      </SafeAreaView>

      {/* Cluster contents sheet — list of every cry inside the tapped cluster */}
      {clusterView && (
        <Modal transparent animationType="slide" onRequestClose={() => setClusterView(null)}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setClusterView(null)}
          />
          <SafeAreaView edges={['bottom']} style={styles.clusterCard}>
            <View style={styles.handle} />
            <View style={styles.clusterHeader}>
              <Text style={styles.clusterTitle}>
                {clusterView.cries.length} {clusterView.cries.length === 1 ? 'cry' : 'cries'} here
              </Text>
              <TouchableOpacity
                style={styles.zoomBtn}
                onPress={() => zoomToCluster(clusterView.clusterId, clusterView.lng, clusterView.lat)}
                activeOpacity={0.75}
              >
                <Text style={[styles.zoomTxt, { color: accent }]}>⊕ Zoom in</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={clusterView.cries}
              keyExtractor={c => c.id}
              style={{ maxHeight: CLUSTER_LIST_MAX_H }}
              renderItem={({ item }) => (
                <ClusterRow
                  cry={item}
                  onPress={() => { tapLight(); setClusterView(null); setSelectedCry(item); }}
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.clSep} />}
              showsVerticalScrollIndicator={false}
            />
          </SafeAreaView>
        </Modal>
      )}

      {selectedCry && (
        <Modal transparent animationType="slide" onRequestClose={() => setSelectedCry(null)}>
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  map: { flex: 1 },

  // Header
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },

  // Segmented control — centered, floating
  filterContainer: {
    position: 'absolute', bottom: 110, left: 0, right: 0,
    alignItems: 'center',
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(13,17,23,0.88)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  segment: {
    paddingHorizontal: 22, paddingVertical: 9,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  segmentBorder: { borderRightWidth: 1, borderRightColor: '#1f2937' },
  segmentEmoji: { fontSize: 20 },
  segmentLabel: {
    color: '#94a3b8', fontSize: 10, fontWeight: '700',
    fontFamily: 'monospace', letterSpacing: 0.5,
  },
  segmentLabelActive: { color: '#0d1117' },
  center: {
    flex: 1, backgroundColor: '#0d1117',
    alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 40,
  },
  loadingText: { color: '#4a5568', fontSize: 14, marginTop: 12, fontFamily: 'monospace' },
  errorTitle: { color: '#6fe0e6', fontSize: 18, fontWeight: '600' },
  errorSub: { color: '#4a5568', fontSize: 14, textAlign: 'center' },
  settingsBtn: {
    marginTop: 8, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 28,
  },
  settingsBtnTxt: { color: '#0d1117', fontSize: 14, fontWeight: '700' },

  headerTitle: {
    color: '#6fe0e6', fontSize: 18, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    backgroundColor: 'rgba(13,17,23,0.7)',
  },

  fabContainer: { position: 'absolute', bottom: 0, right: 0, alignItems: 'flex-end' },
  fab: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#6fe0e6',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 24, marginBottom: 24,
    shadowColor: '#6fe0e6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabIcon: { fontSize: 32, color: '#0d1117', lineHeight: 36, fontWeight: '300' },

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
  profileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  profileInfo: { flex: 1 },
  profileName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  profileHandle: { color: '#4a5568', fontSize: 12 },
  profileArrow: { color: '#4a5568', fontSize: 20, fontWeight: '300' },
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
  photo: {
    width: '100%', height: 180, borderRadius: 12,
    backgroundColor: '#0d1117',
  },
  noteBox: {
    backgroundColor: '#0d1117', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#1f2937',
  },
  noteText: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  noNote: { color: '#374151', fontSize: 13, fontFamily: 'monospace' },
  // First-cry hint
  hintContainer: { position: 'absolute', bottom: 0, right: 0, alignItems: 'flex-end' },
  firstCryHint: {
    backgroundColor: 'rgba(13,17,23,0.92)',
    borderWidth: 1, borderColor: '#1f2937', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 8,
    marginRight: 24, marginBottom: 100,
  },
  firstCryHintTxt: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },

  // Cluster contents sheet
  clusterCard: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, borderTopWidth: 1, borderColor: '#1f2937',
  },
  clusterHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  clusterTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  zoomBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#1f2937',
  },
  zoomTxt: { fontSize: 13, fontWeight: '600' },
  clSep: { height: 1, backgroundColor: '#1f2937', marginLeft: 20 },
  clRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  clUser: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  clHandle: { color: '#4a5568', fontSize: 12, fontWeight: '400' },
  clEmotion: {
    fontSize: 12, fontWeight: '600',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden',
  },
  clNote: { color: '#64748b', fontSize: 12 },
  clDate: { color: '#374151', fontSize: 11, fontFamily: 'monospace' },
  clArrow: { color: '#4a5568', fontSize: 20, fontWeight: '300' },
});
