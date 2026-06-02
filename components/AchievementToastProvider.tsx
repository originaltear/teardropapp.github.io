/**
 * Global achievement-toast provider.
 *
 * Achievements unlock at the moment a cry is logged (in log-cry.tsx), which then
 * navigates away immediately. A toast living inside any single screen therefore
 * never gets a chance to fire. This provider lives at the root of the app, so any
 * screen can call `queueAchievements(...)` and the unlock popup is shown over
 * whatever screen the user lands on. Multiple unlocks are shown one at a time.
 */
import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { AchievementToast } from './AchievementToast';
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

  return (
    <Ctx.Provider value={{ queueAchievements }}>
      {children}
      <AchievementToast achievement={current} onDismiss={() => setCurrent(null)} />
    </Ctx.Provider>
  );
}
