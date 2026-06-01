/**
 * Onboarding — shown once on first launch (guest or new user).
 * Persisted via AsyncStorage key 'onboarding_complete'.
 * Route: /onboarding
 */

import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Dimensions, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/themes';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: W } = Dimensions.get('window');

export const ONBOARDING_KEY = 'onboarding_complete';

interface Slide {
  icon: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: '💧',
    title: 'Map Your Tears',
    body: 'Every cry has a place. Drop a pin wherever life gets to you — and watch your emotional map grow.',
  },
  {
    icon: '🌍',
    title: 'Every Cry Tells a Story',
    body: 'Add what you felt, how intense it was, a note, a photo, or a voice recording. Your story, your way.',
  },
  {
    icon: '👥',
    title: "You're Not Alone",
    body: "Follow friends, see where they've cried, and show up for each other — without saying a word.",
  },
  {
    icon: '🔒',
    title: 'Your Privacy, Your Rules',
    body: 'Share with everyone, just your friends, your close circle — or keep it entirely to yourself.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / W);
    setIndex(newIndex);
  }

  function goNext() {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  }

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(auth)/login');
  }

  async function skip() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(auth)/login');
  }

  const isLast = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>

      {/* Skip button */}
      <View style={s.topBar}>
        {!isLast ? (
          <TouchableOpacity onPress={skip} activeOpacity={0.7} style={s.skipBtn}>
            <Text style={s.skipTxt}>Skip</Text>
          </TouchableOpacity>
        ) : <View style={s.skipBtn} />}
      </View>

      {/* Slides */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={s.slide}>
            <View style={s.iconCircle}>
              <Text style={s.iconText}>{item.icon}</Text>
            </View>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === index && s.dotActive]} />
        ))}
      </View>

      {/* CTA */}
      <View style={s.footer}>
        {isLast ? (
          <TouchableOpacity style={s.getStartedBtn} onPress={finish} activeOpacity={0.85}>
            <Text style={s.getStartedTxt}>Get Started</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.nextBtn} onPress={goNext} activeOpacity={0.75}>
            <Text style={s.nextTxt}>Next  →</Text>
          </TouchableOpacity>
        )}
      </View>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },

  topBar: {
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  skipBtn: { paddingVertical: 6, paddingHorizontal: 4, minWidth: 50, alignItems: 'flex-end' },
  skipTxt: { color: '#4a5568', fontSize: 14, fontWeight: '500' },

  slide: {
    width: W,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 20,
  },

  iconCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#111827',
    borderWidth: 1, borderColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#6fe0e6', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 10,
  },
  iconText: { fontSize: 56 },

  title: {
    color: '#e2e8f0',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 36,
  },
  body: {
    color: '#64748b',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 26,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 20,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#1f2937',
  },
  dotActive: {
    width: 20, backgroundColor: '#6fe0e6',
  },

  footer: { paddingHorizontal: 32, paddingBottom: 12 },

  getStartedBtn: {
    backgroundColor: '#6fe0e6',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  getStartedTxt: { color: '#0d1117', fontSize: 17, fontWeight: '800' },

  nextBtn: {
    borderWidth: 1, borderColor: '#1f2937',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  nextTxt: { color: '#6fe0e6', fontSize: 16, fontWeight: '600' },
});
