/**
 * lib/haptics.ts — thin, crash-safe wrapper around expo-haptics.
 *
 * Every call is wrapped so a missing/unlinked native module or an unsupported
 * device can never throw into the UI. Fire-and-forget — we never await, and any
 * rejected promise is swallowed. Import these helpers instead of expo-haptics
 * directly so haptics stay centralised and optional.
 */
import * as Haptics from 'expo-haptics';

function safe(fn: () => Promise<unknown> | void): void {
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
