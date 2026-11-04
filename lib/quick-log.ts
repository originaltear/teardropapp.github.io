/**
 * Quick-log detection — the single source of truth for what counts as a
 * "quick log": a cry with emotion + location only, no details added yet.
 * Used by the My Cries and Feed "Mine" filters and their row badges.
 *
 * Also the one-tap log ("Just drop a tear"), saved with QUICK_EMOTION in place
 * of an emotion. The column has no check on its value, and every screen already
 * falls back to the raw value and Teardrop blue for an id it doesn't know, so
 * older app versions show "Quick log" as plain text. That is why the value is
 * readable and not a code. An hour later, if notifications are allowed, one
 * local reminder asks whether they want to add how it felt. It is cancelled as
 * soon as the cry is edited or deleted, and there is never a second one.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { Cry } from './storage';
import type { SocialCry } from './social';

function isBare(
  note?: string | null,
  photo?: string | null,
  audio?: string | null,
  tags?: string[] | null,
): boolean {
  return !note && !photo && !audio && !(tags && tags.length > 0);
}

/** Local/own cry shape (lib/storage). */
export function isQuickLog(c: Cry): boolean {
  return isBare(c.note, c.photoUri, c.audioUri, c.tags);
}

/** Server cry shape (lib/social). */
export function isQuickLogSocial(c: SocialCry): boolean {
  return isBare(c.note, c.photo_uri, c.audio_uri, c.tags);
}

// ─── One-tap follow-up ────────────────────────────────────────────────────────

const FOLLOWUP_KEY = 'teardrop_quick_followups';
const FOLLOWUP_DELAY_S = __DEV__ ? 30 : 3600;

async function loadFollowups(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOWUP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function scheduleQuickFollowup(cryId: string): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Earlier you dropped a tear',
        body: 'Want to add how it felt?',
        data: { type: 'quick_followup', cry_id: cryId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: FOLLOWUP_DELAY_S,
        channelId: 'default',
      },
    });
    const all = await loadFollowups();
    all[cryId] = notifId;
    await AsyncStorage.setItem(FOLLOWUP_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('[quick-log] follow-up not scheduled:', e);
  }
}

export async function cancelQuickFollowup(cryId: string): Promise<void> {
  try {
    const all = await loadFollowups();
    const notifId = all[cryId];
    if (!notifId) return;
    delete all[cryId];
    await AsyncStorage.setItem(FOLLOWUP_KEY, JSON.stringify(all));
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {
    // Best-effort: the worst case is one reminder about a cry already edited.
  }
}
