export interface Emotion {
  id: string;
  label: string;
  color: string;
  emoji: string;
}

export const EMOTIONS: Emotion[] = [
  { id: 'joy',        label: 'Joy Tears',    color: '#f2cf6b', emoji: '✨' },
  { id: 'rage',       label: 'Rage Tears',   color: '#ef6f6f', emoji: '🔥' },
  { id: 'anxiety',    label: 'Anxiety',      color: '#a99cf0', emoji: '🌀' },
  { id: 'heartbreak', label: 'Heartbroken',  color: '#6fa8e0', emoji: '💔' },
  { id: 'bittersweet',label: 'Bittersweet',  color: '#ef9bb3', emoji: '🌸' },
  { id: 'exhausted',  label: 'Exhausted',    color: '#8a9bb5', emoji: '🌫️' },
  { id: 'relief',     label: 'Relief',       color: '#8fe0a8', emoji: '🍃' },
  { id: 'overwhelmed',label: 'Overwhelmed',  color: '#f2a86b', emoji: '🌊' },
  { id: 'mixed',      label: 'Mixed',        color: '#6fe0e6', emoji: '💧' },
];

export function emotionById(id: string): Emotion | undefined {
  return EMOTIONS.find(e => e.id === id);
}
