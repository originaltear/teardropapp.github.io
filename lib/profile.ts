import AsyncStorage from '@react-native-async-storage/async-storage';
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

/**
 * Uploads a local image URI to Supabase Storage (avatars bucket).
 * Returns the public URL, or the original local URI on failure.
 */
export async function uploadAvatar(localUri: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return localUri; // Not logged in — keep local

  // Skip if it's already a remote URL
  if (localUri.startsWith('http://') || localUri.startsWith('https://')) return localUri;

  try {
    // Read the image as a Blob via the Fetch API (works for file:// and content:// URIs)
    const response = await fetch(localUri);
    const blob = await response.blob();

    const fileName = `${session.user.id}/avatar-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    // Add cache-buster so React Native Image doesn't serve the old cached version
    return `${publicUrl}?t=${Date.now()}`;
  } catch (err) {
    console.warn('[uploadAvatar] Upload failed — keeping local URI:', err);
    return localUri;
  }
}
