/**
 * lib/haptics.ts — thin, crash-safe wrapper around expo-haptics.
 *
 * Every call is wrapped so a missing/unlinked native module or an unsupported
 * device can never throw into the UI. Fire-and-forget — we never await, and any
 * rejected promise is swallowed. Import these helpers instead of expo-haptics
 * directly so haptics stay centralised and optional.
 *
 * Haptics can be turned off by the user (Settings → Appearance → Haptic
 * feedback). The choice is persisted in AsyncStorage and mirrored into the
 * in-memory `enabled` flag below, which is checked synchronously before every
 * call — so toggling it off makes all haptics no-op instantly, with no
 * per-call storage read.
 */
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const HAPTICS_KEY = 'teardrop_haptics_enabled';

// In-memory flag, checked synchronously before every haptic. Defaults to on.
let enabled = true;

/** Hydrate the flag from storage. Called once on module load; safe to re-call. */
export async function loadHapticsPref(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(HAPTICS_KEY);
    enabled = v !== '0'; // anything but the explicit "off" sentinel counts as on
  } catch {
    enabled = true;
  }
  return enabled;
}

/** Persist + apply the user's choice. Returns once stored. */
export async function setHapticsEnabled(v: boolean): Promise<void> {
  enabled = v; // apply immediately so the very next haptic respects it
  try {
    await AsyncStorage.setItem(HAPTICS_KEY, v ? '1' : '0');
  } catch {
    /* best-effort — the in-memory flag is already updated */
  }
}

/** Current in-memory value (synchronous). */
export function hapticsEnabled(): boolean {
  return enabled;
}

// Hydrate as soon as this module is first imported, so the flag is correct
// before the first screen can fire a haptic.
loadHapticsPref();

function safe(fn: () => Promise<unknown> | void): void {
  if (!enabled) return;
  try {
    const r = fn();
    if (r && typeof (r as Promise<unknown>).catch === 'function') {
      (r as Promise<unknown>).catch(() => {});
    }
  } catch {
    /* no-op — haptics are a nicety, never a hard dependency */
  }
}

/** Light tap — selecting an option, toggling a like, expanding a cluster. */
export const tapLight = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Medium thud — primary actions like the + FAB or starting a recording. */
export const tapMedium = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** Selection tick — moving through a segmented control / picker / tabs. */
export const selection = () => safe(() => Haptics.selectionAsync());

/** Success buzz — a cry was saved, an achievement unlocked. */
export const success = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** Warning buzz — save failed or a validation error. */
export const warning = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
