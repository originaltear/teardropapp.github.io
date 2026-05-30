import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'teardrop_cries';

export interface Cry {
  id: string;
  createdAt: string;
  latitude: number;
  longitude: number;
  emotion: string;
  intensity: number;
  note?: string;
}

export async function saveCry(cry: Cry): Promise<void> {
  const all = await loadCries();
  await AsyncStorage.setItem(KEY, JSON.stringify([cry, ...all]));
}

export async function loadCries(): Promise<Cry[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Cry[]) : [];
}
