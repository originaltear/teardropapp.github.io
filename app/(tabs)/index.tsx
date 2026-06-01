import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet, View, TouchableOpacity, Text,
  ActivityIndicator, Modal, Image, Alert,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { loadCries, Cry } from '../../lib/storage';
import { emotionById } from '../../lib/emotions';
import { getMapCries, MapFilter, SocialCry } from '../../lib/social';
import { useAuth } from '../../lib/auth';
import { TearsBadge } from '../../components/TearsBadge';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
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

// ─── Audio player ─────────────────────────────────────────────────────────────

function AudioPlayer({ uri }: { uri: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  async function toggle() {
    if (playing) {
      await soundRef.current?.stopAsync();
      setPlaying(false);
      return;
    }
    try {
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate(s => {
        if (s.isLoaded && s.didJustFinish) {
          setPlaying(false);
          sound.unloadAsync();
        }
      });
      await sound.playAsync();
    } catch {
      Alert.alert('Error', 'Could not play audio.');
    }
  }

  return (
    <TouchableOpacity style={styles.audioPlayer} onPress={toggle} activeOpacity={0.8}>
      <Text style={styles.audioIcon}>{playing ? '⏹' : '▶'}</Text>
      <Text style={styles.audioLabel}>{playing ? 'Stop voice note' : 'Play voice note'}</Text>
    </TouchableOpacity>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ uri, size = 36 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#6fe0e6', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.45 }}>💧</Text>
    </View>
  );
}

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
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.dateText}>{formatDate(cry.date)}</Text>
      <Drops intensity={cry.intensity} />

      {cry.photoUri ? (
        <Image source={{ uri: cry.photoUri }} style={styles.photo} resizeMode="cover" />
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

// ─── Map screen ───────────────────────────────────────────────────────────────

export default function MapScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const mapRef = useRef<MapView>(null);
  const initialRegionRef = useRef<Region | null>(null);
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cries, setCries] = useState<(Cry | SocialCry)[]>([]);
  const [selectedCry, setSelectedCry] = useState<Cry | SocialCry | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [mapFilter, setMapFilter] = useState<MapFilter>('mine');

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
      setGpsCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setGpsReady(true);
    })();
  }, []);

  useFocusEffect(useCallback(() => {
    if (session && mapFilter !== 'mine') {
      getMapCries(mapFilter).then(setCries);
    } else {
      loadCries().then(setCries);
    }
  }, [session, mapFilter]));

  function handleAddCry() {
    if (!gpsCoords) return;
    router.push({
      pathname: '/log-cry',
      params: { lat: String(gpsCoords.latitude), lng: String(gpsCoords.longitude) },
    });
  }

  if (permissionDenied) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 48 }}>📍</Text>
        <Text style={styles.errorTitle}>Location needed</Text>
        <Text style={styles.errorSub}>Enable location in Settings to log where you cried.</Text>
      </View>
    );
  }

  if (!gpsReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6fe0e6" />
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
        showsUserLocation
        showsMyLocationButton={false}
      >
        {cries
          // Guard: skip pins with invalid coords or private profiles (global filter)
          .filter(cry => {
            if (!cry.latitude || !cry.longitude) return false;
            const sc = cry as SocialCry;
            // For global filter, only show public profiles
            if (mapFilter === 'global' && sc.profile && (sc.profile as any).is_public === false) return false;
            return true;
          })
          .map(cry => {
            const emotion = emotionById(cry.emotion);
            const color = emotion?.color ?? '#6fe0e6';
            return (
              <Marker
                key={cry.id}
                coordinate={{ latitude: cry.latitude, longitude: cry.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => setSelectedCry(cry)}
              >
                <View style={[styles.pin, { backgroundColor: color }]}>
                  <Text style={styles.pinEmoji}>{emotion?.emoji ?? '💧'}</Text>
                </View>
              </Marker>
            );
          })}
      </MapView>

      {/* Header title */}
      <SafeAreaView edges={['top']} style={styles.headerOverlay} pointerEvents="none">
        <Text style={styles.headerTitle}>💧 Teardrop</Text>
      </SafeAreaView>

      {/* Segmented filter — centered, floating above FAB */}
      {session && (
        <View style={styles.filterContainer} pointerEvents="box-none">
          <View style={styles.segmented}>
            {(['mine', 'following', 'global'] as MapFilter[]).map((f, i) => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.segment,
                  mapFilter === f && styles.segmentActive,
                  i < 2 && styles.segmentBorder,
                ]}
                onPress={() => setMapFilter(f)}
                activeOpacity={0.75}
              >
                <Text style={styles.segmentEmoji}>
                  {f === 'mine' ? '👤' : f === 'following' ? '👥' : '🌍'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <SafeAreaView edges={['bottom']} style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={handleAddCry} activeOpacity={0.85}>
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      </SafeAreaView>

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
    paddingHorizontal: 26, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  segmentBorder: { borderRightWidth: 1, borderRightColor: '#1f2937' },
  segmentActive: { backgroundColor: '#6fe0e6' },
  segmentEmoji: { fontSize: 22 },
  center: {
    flex: 1, backgroundColor: '#0d1117',
    alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 40,
  },
  loadingText: { color: '#4a5568', fontSize: 14, marginTop: 12, fontFamily: 'monospace' },
  errorTitle: { color: '#6fe0e6', fontSize: 18, fontWeight: '600' },
  errorSub: { color: '#4a5568', fontSize: 14, textAlign: 'center' },

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

  pin: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  pinEmoji: { fontSize: 18 },

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
  audioPlayer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0d1117', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#6fe0e6',
  },
  audioIcon: { fontSize: 18, color: '#6fe0e6' },
  audioLabel: { color: '#6fe0e6', fontSize: 14, fontWeight: '500' },
});
