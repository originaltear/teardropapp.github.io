import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

export interface Profile {
  displayName: string;
  bio: string;
  avatarUri?: string;   // local URI or Supabase Storage public URL
  // Kept for backward compat with old stored data — not editable in UI
  avatarColor: string;
  avatarEmoji: string;
}

const LOCAL_KEY = 'teardrop_profile';

export const DEFAULT_PROFILE: Profile = {
  displayName: 'You',
  bio: '',
  avatarColor: '#6fe0e6',
  avatarEmoji: '💧',
};

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadProfile(): Promise<Profile> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, avatar_uri, bio')
      .eq('id', session.user.id)
      .single();
    if (!error && data) {
      return {
        ...DEFAULT_PROFILE,
        displayName: data.display_name ?? 'You',
        bio: data.bio ?? '',
        avatarUri: data.avatar_uri ?? undefined,
      };
    }
  }

  // Fall back to local AsyncStorage
  const raw = await AsyncStorage.getItem(LOCAL_KEY);
  return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveProfile(profile: Profile): Promise<void> {
  // Always persist locally
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(profile));

  // Sync to Supabase
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: profile.displayName,
      bio: profile.bio || null,
      avatar_uri: profile.avatarUri ?? null,
    })
    .eq('id', session.user.id);

  if (error) {
    console.warn('[saveProfile] Supabase update failed:', error.message);
  }
}

// ─── Avatar upload ────────────────────────────────────────────────────────────

/** Decode a base64 string into raw bytes without any extra dependency. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = global.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Uploads a local image URI to Supabase Storage (avatars bucket) and returns the
 * public URL.
 *
 * - If `localUri` is already a remote URL, it is returned unchanged.
 * - On failure, returns `null` — it must NEVER persist a local `file://` path to
 *   the database. A local path works on the current install but points at the
 *   app's private cache, which is wiped on reinstall, leaving a broken image
 *   (the "grey circle after reinstall" bug).
 *
 * Note: we read the file via expo-file-system rather than `fetch(uri).blob()` —
 * the Fetch/Blob path is unreliable for file:// URIs on React Native and was
 * silently producing empty uploads, which is why every avatar fell back to a
 * local path.
 */
export async function uploadAvatar(localUri: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null; // Not logged in — can't upload

  // Already a remote URL — nothing to do
  if (localUri.startsWith('http://') || localUri.startsWith('https://')) return localUri;

  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) throw new Error('read returned empty contents');

    const bytes = base64ToBytes(base64);
    if (bytes.length === 0) throw new Error('decoded file is empty');

    const fileName = `${session.user.id}/avatar-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, bytes, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    // Add cache-buster so React Native Image doesn't serve the old cached version
    return `${publicUrl}?t=${Date.now()}`;
  } catch (err) {
    console.warn('[uploadAvatar] Upload failed:', err);
    return null;
  }
}
