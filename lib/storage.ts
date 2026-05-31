import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCAL_KEY = 'teardrop_cries';

export interface Cry {
  id: string;
  createdAt: string;
  latitude: number;
  longitude: number;
  emotion: string;
  intensity: number;
  note?: string;
  photoUri?: string;    // local or remote URI
  audioUri?: string;    // local URI (not uploaded to storage yet)
  country?: string;
}

// ─── Local helpers ────────────────────────────────────────────────────────────

async function localLoad(): Promise<Cry[]> {
  const raw = await AsyncStorage.getItem(LOCAL_KEY);
  return raw ? (JSON.parse(raw) as Cry[]) : [];
}

async function localSave(cries: Cry[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(cries));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function saveCry(cry: Cry): Promise<void> {
  // 1. Always persist locally first (offline-safe)
  const all = await localLoad();
  await localSave([cry, ...all]);

  // 2. Try to sync to Supabase
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { error } = await supabase.from('cries').insert({
    id: cry.id,
    user_id: session.user.id,
    created_at: cry.createdAt,
    latitude: cry.latitude,
    longitude: cry.longitude,
    emotion: cry.emotion,
    intensity: cry.intensity,
    note: cry.note ?? null,
    photo_uri: cry.photoUri ?? null,
    audio_uri: cry.audioUri ?? null,
    country: cry.country ?? null,
  });

  if (error) {
    console.warn('[saveCry] Supabase insert failed — local copy kept:', error.message);
  }
}

export async function loadCries(): Promise<Cry[]> {
  // Try Supabase first
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const { data, error } = await supabase
      .from('cries')
      .select('id, created_at, latitude, longitude, emotion, intensity, note, photo_uri, audio_uri, country')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data.map(r => ({
        id: r.id,
        createdAt: r.created_at,
        latitude: r.latitude,
        longitude: r.longitude,
        emotion: r.emotion,
        intensity: r.intensity,
        note: r.note ?? undefined,
        photoUri: r.photo_uri ?? undefined,
        audioUri: r.audio_uri ?? undefined,
        country: r.country ?? undefined,
      }));
    }
  }

  // Fall back to local
  return localLoad();
}
