import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Profile {
  displayName: string;
  bio: string;
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

export const AVATAR_COLORS = [
  '#6fe0e6', '#f2cf6b', '#ef6f6f', '#a99cf0',
  '#6fa8e0', '#ef9bb3', '#8fe0a8', '#f2a86b', '#8a9bb5',
];

export const AVATAR_EMOJIS = [
  '💧', '✨', '🔥', '🌀', '💔',
  '🌸', '🌫️', '🍃', '🌊', '😶',
  '🥺', '😭', '🤧', '💫', '🫧',
];

export async function loadProfile(): Promise<Profile> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}
