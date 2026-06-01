/**
 * lib/themes.ts — App-wide theme system
 *
 * 4 dark themes differing only in accent colour.
 * The accent colour replaces every #6fe0e6 teal in interactive elements.
 * Theme choice is persisted in AsyncStorage.
 */

import { createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Theme definitions ────────────────────────────────────────────────────────

export interface ThemeDef {
  id: string;
  name: string;
  emoji: string;
  accent: string;
  accentDim: string;   // accent + '22' equivalent for backgrounds
  premium: boolean;
}

export const THEMES: ThemeDef[] = [
  {
    id: 'default',
    name: 'Default',
    emoji: '💧',
    accent: '#6fe0e6',
    accentDim: '#6fe0e622',
    premium: false,
  },
  {
    id: 'crimson',
    name: 'Crimson',
    emoji: '🔴',
    accent: '#e05c6f',
    accentDim: '#e05c6f22',
    premium: true,
  },
  {
    id: 'forest',
    name: 'Forest',
    emoji: '🌿',
    accent: '#4ade80',
    accentDim: '#4ade8022',
    premium: true,
  },
  {
    id: 'dusk',
    name: 'Dusk',
    emoji: '🌙',
    accent: '#a78bfa',
    accentDim: '#a78bfa22',
    premium: true,
  },
];

export const DEFAULT_THEME = THEMES[0];

const THEME_KEY = 'teardrop_theme';

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function loadSavedTheme(): Promise<ThemeDef> {
  try {
    const id = await AsyncStorage.getItem(THEME_KEY);
    return THEMES.find(t => t.id === id) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export async function saveTheme(theme: ThemeDef): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, theme.id);
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface ThemeContextValue {
  theme: ThemeDef;
  setTheme: (t: ThemeDef) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
