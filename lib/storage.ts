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
  photoUri?: string;
  audioUri?: string;
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

// ─── Ensure a profiles row exists (belt-and-suspenders for signup trigger) ───

async function ensureProfile(userId: string, email?: string): Promise<void> {
  await supabase
    .from('profiles')
    .upsert(
      { id: userId, display_name: email?.split('@')[0] ?? 'You' },
      { onConflict: 'id', ignoreDuplicates: true },
    );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function saveCry(cry: Cry): Promise<void> {
  // 1. Always persist locally (guest-safe / offline-safe)
  const all = await localLoad();
  await localSave([cry, ...all]);

  // 2. Try Supabase if logged in
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData?.session) return;      // guest or session error → local only
  const { session } = sessionData;

  // Belt-and-suspenders: make sure the profile row exists so the FK doesn't reject the insert
  await ensureProfile(session.user.id, session.user.email);

  const { error } = await supabase.from('cries').insert({
    id:         cry.id,
    user_id:    session.user.id,
    created_at: cry.createdAt,
    latitude:   cry.latitude,
    longitude:  cry.longitude,
    emotion:    cry.emotion,
    intensity:  cry.intensity,
    note:       cry.note       ?? null,
    photo_uri:  cry.photoUri   ?? null,
    audio_uri:  cry.audioUri   ?? null,
    country:    cry.country    ?? null,
  });

  if (error) {
    // Surface errors clearly so they appear in Metro logs
    console.error('[saveCry] Supabase insert failed:', error.message, error.code, error.details);
  }
}

export async function loadCries(): Promise<Cry[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (session) {
    const { data, error } = await supabase
      .from('cries')
      .select('id, created_at, latitude, longitude, emotion, intensity, note, photo_uri, audio_uri, country')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data.map(r => ({
        id:        r.id,
        createdAt: r.created_at,
        latitude:  r.latitude,
        longitude: r.longitude,
        emotion:   r.emotion,
        intensity: r.intensity,
        note:      r.note      ?? undefined,
        photoUri:  r.photo_uri ?? undefined,
        audioUri:  r.audio_uri ?? undefined,
        country:   r.country   ?? undefined,
      }));
    }
    if (error) {
      console.error('[loadCries] Supabase fetch failed:', error.message);
    }
  }

  // Guest or offline → local
  return localLoad();
}

// ─── UUID validation ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean { return UUID_RE.test(id); }

// ─── Sync local cries to Supabase (called on login) ──────────────────────────

export async function syncLocalToSupabase(userId: string, userEmail?: string): Promise<void> {
  const local = await localLoad();
  if (local.length === 0) return;

  await ensureProfile(userId, userEmail);

  // Skip cries with legacy non-UUID IDs — they were created before Phase 3
  const syncable = local.filter(c => isValidUuid(c.id));
  if (syncable.length === 0) {
    console.log('[syncLocalToSupabase] no valid-UUID cries to sync (legacy IDs skipped)');
    return;
  }

  const rows = syncable.map(cry => ({
    id:         cry.id,
    user_id:    userId,
    created_at: cry.createdAt,
    latitude:   cry.latitude,
    longitude:  cry.longitude,
    emotion:    cry.emotion,
    intensity:  cry.intensity,
    note:       cry.note      ?? null,
    photo_uri:  cry.photoUri  ?? null,
    audio_uri:  cry.audioUri  ?? null,
    country:    cry.country   ?? null,
  }));

  const { error } = await supabase
    .from('cries')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    console.warn('[syncLocalToSupabase] upsert failed:', error.message);
  } else {
    console.log(`[syncLocalToSupabase] synced ${rows.length} cries (${local.length - syncable.length} legacy skipped)`);
  }
}
