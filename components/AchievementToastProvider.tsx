/**
 * Global achievement-toast provider.
 *
 * Achievements unlock at the moment a cry is logged (in log-cry.tsx), which then
 * navigates away immediately. A toast living inside any single screen therefore
 * never gets a chance to fire. This provider lives at the root of the app, so any
 * screen can call `queueAchievements(...)` and the unlock popup is shown over
 * whatever screen the user lands on. Multiple unlocks are shown one at a time.
 *
 * It also owns what comes after the celebration: the notification explainer
 * (lib/push-ask.ts) or the review prompt, never both, and never on top of a toast.
 */
import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { AchievementToast } from './AchievementToast';
import { maybeAskForReview } from '../lib/review';
import { registerPushToken } from '../lib/notifications';
import {
  onPushMoment, shouldAskForPush, markPushAsked, type PushAskReason,
} from '../lib/push-ask';
import { PushAskSheet } from './PushAskSheet';
import type { Achievement } from '../lib/achievements';

interface AchievementToastCtx {
  queueAchievements: (items: Achievement[]) => void;
}

const Ctx = createContext<AchievementToastCtx>({ queueAchievements: () => {} });

/** Hook to enqueue newly unlocked achievements for display. */
export function useAchievementToast(): AchievementToastCtx {
  return useContext(Ctx);
}

export function AchievementToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Achievement[]>([]);
  const [current, setCurrent] = useState<Achievement | null>(null);

  const queueAchievements = useCallback((items: Achievement[]) => {
    if (!items?.length) return;
    setQueue(prev => {
      // De-dupe by id so the same unlock can't be enqueued twice.
      const seen = new Set(prev.map(a => a.id));
      const additions = items.filter(a => a && !seen.has(a.id));
      return additions.length ? [...prev, ...additions] : prev;
    });
  }, []);

  // Promote the next queued achievement whenever the toast is idle.
  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue(prev => prev.slice(1));
    }
  }, [current, queue]);

  // A cry logged or a first follow, waiting for the toasts to finish.
  const [pushMoment, setPushMoment] = useState<PushAskReason | null>(null);
  const [pushAskOpen, setPushAskOpen] = useState(false);
  useEffect(() => onPushMoment(setPushMoment), []);

  // Once the celebration is over and nothing else is waiting, this is the
  // app's natural high point. The notification explainer goes first when it is
  // due, because it only ever gets two chances; otherwise it is the one moment
  // worth asking for a review. Each helper decides whether it's actually due.
  const [celebrated, setCelebrated] = useState(false);
  useEffect(() => {
    if (current) { setCelebrated(true); return; }
    if (queue.length > 0 || (!celebrated && !pushMoment)) return;
    const reason = pushMoment;
    const reviewDue = celebrated;
    const t = setTimeout(async () => {
      setCelebrated(false);
      setPushMoment(null);
      if (reason && await shouldAskForPush(reason)) {
        await markPushAsked();
        setPushAskOpen(true);
        return;
      }
      if (reviewDue) maybeAskForReview();
    }, 1200);
    return () => clearTimeout(t);
  }, [current, queue.length, celebrated, pushMoment]);

  return (
    <Ctx.Provider value={{ queueAchievements }}>
      {children}
      <AchievementToast achievement={current} onDismiss={() => setCurrent(null)} />
      <PushAskSheet
        visible={pushAskOpen}
        onAllow={() => { setPushAskOpen(false); registerPushToken(); }}
        onLater={() => setPushAskOpen(false)}
      />
    </Ctx.Provider>
  );
}
