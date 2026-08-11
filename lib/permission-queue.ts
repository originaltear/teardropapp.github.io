/**
 * lib/permission-queue.ts — one system permission dialog at a time.
 *
 * Three permissions used to be requested the moment the app launched: push
 * notifications from the root layout, App Tracking Transparency from the ad
 * init, and location from the map screen mounting behind the splash. They raced
 * each other.
 *
 * On iOS that isn't just untidy, it silently breaks ATT: the tracking prompt is
 * never displayed while another permission request is pending, and the call
 * returns as though the user had been asked. App review rejected 1.0.6 for
 * exactly this — the reviewer could not find the prompt because it had never
 * been drawn.
 *
 * Everything that shows a system dialog goes through here, so each one waits
 * for the last to be answered.
 */
import { AppState } from 'react-native';

/** Tail of the chain. Each new request appends itself to this. */
let tail: Promise<unknown> = Promise.resolve();

/** Resolves once the app is actually in the foreground. */
function whenActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise(resolve => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
}

/**
 * Runs `request` once every previously queued request has settled and the app
 * is in the foreground.
 *
 * A rejected request never breaks the chain: the queue only cares that the
 * dialog is finished, not whether it was granted, so callers keep their own
 * error handling.
 */
export function requestPermission<T>(request: () => Promise<T>): Promise<T> {
  const run = tail
    .catch(() => {})            // a previous failure must not stall the queue
    .then(whenActive)
    .then(request);

  tail = run.catch(() => {});   // keep the chain alive for whoever is next
  return run;
}
