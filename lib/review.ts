/**
 * lib/review.ts — in-app review prompt.
 *
 * Ratings gate more than vanity: they drive App Store search ranking and
 * conversion, and ~90% of editorially featured apps sit at 4.0★+. Without a
 * prompt the only people who bother rating are the ones annoyed enough to seek
 * out the store page.
 *
 * Two deliberate design choices:
 *
 *  - Soft ask first. The OS review sheet can only be shown a few times per year
 *    per user, and it renders its own fixed text. So we ask in our own voice
 *    first and only spend one of those scarce native prompts on someone who
 *    already said yes. The ask is neutral ("would you mind…"), not a filter that
 *    routes unhappy users away from the store — that's against the spirit of
 *    Apple's review guidelines.
 *  - Asked at a high point, never at a low one. It fires after an achievement
 *    unlock, not after logging a cry: interrupting someone who just recorded a
 *    hard moment to ask for a favour would be tone-deaf.
 */
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { loadCries } from './storage';

const COUNT_KEY = 'teardrop_review_asked_count';
const LAST_KEY = 'teardrop_review_last_asked';

/** Don't ask someone who hasn't really used the app yet. */
const MIN_CRIES = 5;
/** Never nag: at most this many asks, ever. */
const MAX_ASKS = 3;
/** …and never twice inside this window. */
const MIN_DAYS_BETWEEN = 120;

const DAY_MS = 86_400_000;

/**
 * Asks for a review if this is a good moment and we haven't asked recently.
 * Fire-and-forget: every failure path is silent, because a review prompt must
 * never be the reason something breaks.
 */
export async function maybeAskForReview(): Promise<void> {
  try {
    if (!(await StoreReview.isAvailableAsync())) return;

    const [[, countRaw], [, lastRaw]] = await AsyncStorage.multiGet([COUNT_KEY, LAST_KEY]);
    const asked = parseInt(countRaw ?? '0', 10) || 0;
    if (asked >= MAX_ASKS) return;

    const last = parseInt(lastRaw ?? '0', 10) || 0;
    if (last && Date.now() - last < MIN_DAYS_BETWEEN * DAY_MS) return;

    const cries = await loadCries();
    if (cries.length < MIN_CRIES) return;

    // Record before showing: if the user backgrounds the app mid-dialog we'd
    // rather skip an ask than repeat one.
    await AsyncStorage.multiSet([
      [COUNT_KEY, String(asked + 1)],
      [LAST_KEY, String(Date.now())],
    ]);

    Alert.alert(
      'Enjoying Teardrop? 💧',
      "If you like crying with us, would you mind leaving a review? It's the single biggest thing that helps other people find the app.",
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: "Sure, I'll review",
          onPress: () => { StoreReview.requestReview().catch(() => {}); },
        },
      ],
    );
  } catch {
    // Never surface an error for this.
  }
}
