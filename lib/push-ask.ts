/**
 * lib/push-ask.ts — when to ask for notifications, and how often.
 *
 * The system prompt used to appear at login, before the person had done
 * anything that a notification could be about. Now it waits for a moment that
 * explains itself: the first cry logged, or the first person followed. An
 * explainer comes first, and only a yes there leads to the system dialog, which
 * on iOS can be shown once and never again.
 *
 * Two asks at most. A "Not now" after the first cry gets one more chance when
 * they follow someone, because that is when a hug becomes possible.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

export type PushAskReason = 'cry' | 'follow';

const KEY = 'push_ask_v1';
const MAX_ASKS = 2;
/** The second ask never lands on the same day as the first. */
const MIN_GAP_MS = 86_400_000;

interface AskState { asks: number; last: number }

async function readState(): Promise<AskState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { asks: 0, last: 0, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return { asks: 0, last: 0 };
}

/** Whether the explainer should be shown now. Every failure answers no. */
export async function shouldAskForPush(reason: PushAskReason): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const perm = await Notifications.getPermissionsAsync();
    if (perm.status === 'granted') return false;
    // The system dialog will not appear again; an explainer leading nowhere
    // would only be a second disappointment.
    if (!perm.canAskAgain) return false;

    const { asks, last } = await readState();
    if (asks >= MAX_ASKS) return false;
    if (asks === 0) return true;
    return reason === 'follow' && Date.now() - last >= MIN_GAP_MS;
  } catch {
    return false;
  }
}

/** Counted when shown, not when answered: a dismissed sheet still used a turn. */
export async function markPushAsked(): Promise<void> {
  try {
    const { asks } = await readState();
    await AsyncStorage.setItem(KEY, JSON.stringify({ asks: asks + 1, last: Date.now() }));
  } catch { /* best-effort */ }
}

// ─── Moments ──────────────────────────────────────────────────────────────────

type Listener = (reason: PushAskReason) => void;
const listeners = new Set<Listener>();

/**
 * Something happened that a notification could be about. The root provider
 * decides whether and when to ask, so callers never wait on it.
 */
export function pushMoment(reason: PushAskReason): void {
  listeners.forEach(l => l(reason));
}

export function onPushMoment(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
