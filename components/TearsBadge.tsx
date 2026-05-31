/**
 * Phase 5B — Tears emblem display.
 * Shows selected tear emojis next to @username.
 */
import { Text, StyleSheet } from 'react-native';

interface Props {
  tears: string[] | null | undefined;
}

export function TearsBadge({ tears }: Props) {
  if (!tears || tears.length === 0) return null;
  return (
    <Text style={s.tears}>{tears.slice(0, 3).join(' ')}</Text>
  );
}

const s = StyleSheet.create({
  tears: { fontSize: 14, letterSpacing: 1 },
});
