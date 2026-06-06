/**
 * Phase 5C — Achievement unlock toast/modal.
 * Shows a beautiful atmospheric overlay when an achievement unlocks.
 */
import { useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Animated, Dimensions,
} from 'react-native';
import type { Achievement } from '../lib/achievements';
import { success } from '../lib/haptics';

const { width } = Dimensions.get('window');

interface Props {
  achievement: Achievement | null;
  onDismiss: () => void;
}

export function AchievementToast({ achievement, onDismiss }: Props) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!achievement) return;
    success();
    scale.setValue(0.7);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [achievement?.id]);

  if (!achievement) return null;

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onDismiss}>
        <Animated.View style={[s.card, { transform: [{ scale }], opacity }]}>
          {/* Glow ring */}
          <View style={[s.glowRing, achievement.isTear && s.glowRingTear]} />

          {/* Eyebrow */}
          <Text style={s.eyebrow}>✦  ACHIEVEMENT UNLOCKED  ✦</Text>

          {/* Emoji */}
          <Text style={s.emoji}>{achievement.emoji}</Text>

          {/* Title */}
          <Text style={s.title}>{achievement.title}</Text>

          {/* Tear badge */}
          {achievement.isTear && achievement.tearEmoji && (
            <View style={s.tearBadge}>
              <Text style={s.tearBadgeTxt}>{achievement.tearEmoji} Tear Unlocked</Text>
            </View>
          )}

          {/* Message */}
          <Text style={s.message}>"{achievement.unlockMessage}"</Text>

          {/* Dismiss */}
          <TouchableOpacity style={s.btn} onPress={onDismiss} activeOpacity={0.85}>
            <Text style={s.btnTxt}>Nice</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: width - 64,
    backgroundColor: '#111827',
    borderRadius: 24, borderWidth: 1, borderColor: '#1f2937',
    alignItems: 'center', padding: 32, gap: 12,
    shadowColor: '#6fe0e6', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 30, elevation: 24,
    position: 'relative', overflow: 'visible',
  },
  glowRing: {
    position: 'absolute', top: -1, left: -1, right: -1, bottom: -1,
    borderRadius: 24, borderWidth: 1, borderColor: '#6fe0e620',
  },
  glowRingTear: { borderColor: '#f2cf6b40' },
  eyebrow: {
    color: '#6fe0e6', fontSize: 10, fontFamily: 'monospace',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  emoji: { fontSize: 64, marginVertical: 4 },
  title: { color: '#e2e8f0', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  tearBadge: {
    backgroundColor: '#f2cf6b22', borderRadius: 20,
    borderWidth: 1, borderColor: '#f2cf6b44',
    paddingHorizontal: 14, paddingVertical: 5,
  },
  tearBadgeTxt: { color: '#f2cf6b', fontSize: 13, fontWeight: '600' },
  message: {
    color: '#64748b', fontSize: 14, fontStyle: 'italic',
    textAlign: 'center', lineHeight: 22, paddingHorizontal: 8,
  },
  btn: {
    marginTop: 8, backgroundColor: '#6fe0e6',
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 40,
  },
  btnTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
});
