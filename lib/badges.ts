import { Cry } from './storage';

export interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  earned: boolean;
}

/** Returns the current streak in days (0 if broken). */
export function computeStreak(cries: Cry[]): number {
  if (!cries.length) return 0;

  const days = [...new Set(cries.map(c => c.createdAt.slice(0, 10)))]
    .sort()
    .reverse();

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Streak must include today or yesterday to be "active"
  if (days[0] !== today && days[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 0; i < days.length - 1; i++) {
    const a = new Date(days[i]).getTime();
    const b = new Date(days[i + 1]).getTime();
    if (Math.round((a - b) / 86_400_000) === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function computeBadges(cries: Cry[]): Badge[] {
  const streak = computeStreak(cries);
  const usedEmotions = new Set(cries.map(c => c.emotion));
  const hasNightCry = cries.some(c => {
    const h = new Date(c.createdAt).getHours();
    return h >= 0 && h < 4;
  });

  return [
    {
      id: 'first_tear',
      name: 'First Tear',
      description: 'Log your first cry.',
      emoji: '💧',
      earned: cries.length >= 1,
    },
    {
      id: 'night_owl',
      name: 'Night Owl',
      description: 'Log a cry between midnight and 4 am.',
      emoji: '🦉',
      earned: hasNightCry,
    },
    {
      id: 'emotion_explorer',
      name: 'Emotion Explorer',
      description: 'Use all 9 emotion types at least once.',
      emoji: '🌈',
      earned: usedEmotions.size >= 9,
    },
    {
      id: 'week_streak',
      name: 'Week Streak',
      description: 'Cry at least once a day for 7 days in a row.',
      emoji: '🔥',
      earned: streak >= 7,
    },
    {
      id: 'month_streak',
      name: 'Month Streak',
      description: 'Cry at least once a day for 30 days in a row.',
      emoji: '📅',
      earned: streak >= 30,
    },
    {
      id: 'cry_master',
      name: 'Cry Master',
      description: 'Log 100 cries in total.',
      emoji: '🏆',
      earned: cries.length >= 100,
    },
  ];
}
