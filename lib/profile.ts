import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Profile {
  displayName: string;
  bio: string;
  avatarUri?: string;   // Phase 2C: custom photo. Absent = default teardrop icon.
  // Kept for backwards-compat with stored data — no longer editable via UI
  avatarColor: string;
  avatarEmoji: string;
}

const KEY = 'teardrop_profile';

export const DEFAULT_PROFILE: Profile = {
  displayName: 'You',
  bio: '',
  avatarColor: '#6fe0e6',
  avatarEmoji: '💧',
};

// Still exported so existing imports don't break — but no longer shown in UI
export const AVATAR_COLORS: string[] = [];
export const AVATAR_EMOJIS: string[] = [];

export async function loadProfile(): Promise<Profile> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}
