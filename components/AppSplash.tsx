/**
 * Animated splash / loading screen.
 *
 * The native splash (a static dark screen) shows instantly while the JS bundle
 * loads. As soon as React mounts, this overlay takes over with the branded
 * splash artwork (assets/splash-bg.png — logo, title and tagline are baked into
 * the image) and a thin Tear Blue progress bar overlaid just below the tagline.
 *
 * The bar reflects REAL startup progress:
 *   mount            →  bar appears              (~12%)
 *   auth check done  →  more progress            (~45%)   [supabase.auth.getSession]
 *   profile loaded   →  more progress            (~72%)   [profiles query / guest]
 *   map ready        →  bar completes → fade out (100%)   [GPS resolved]
 *
 * Safety timers guarantee the bar always completes (slow GPS, denied permission,
 * or landing on a non-map route never leaves the user stuck on the splash).
 */
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { View, StyleSheet, Animated, Easing, ImageBackground } from 'react-native';
import { useAuth } from '../lib/auth';

const TEAR_BLUE = '#6fe0e6';

// ─── Context so the map can report when it's ready ────────────────────────────

const SplashCtx = createContext<{ markMapReady: () => void }>({ markMapReady: () => {} });
export function useSplashGate() { return useContext(SplashCtx); }

// ─── Visual content (artwork + progress bar) ──────────────────────────────────

function SplashContent({ progress }: { progress: Animated.Value }) {
  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });
  return (
    <ImageBackground
      source={require('../assets/splash-bg.png')}
      style={s.bg}
      resizeMode="cover"
    >
      {/* Loading bar — sits in the dark space just below the baked-in tagline */}
      <View style={s.barTrack}>
        <Animated.View style={[s.barFill, { width }]} />
      </View>
    </ImageBackground>
  );
}

// ─── Gate: drives progress from real milestones, overlays the app ─────────────

export function SplashGate({ children }: { children: React.ReactNode }) {
  const { loading, hasUsername, session } = useAuth();
  const [mapReady, setMapReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Minimum on-screen time so the bar always fills smoothly instead of flashing
  // by on a fast (cached-session) launch.
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 1300);
    return () => clearTimeout(t);
  }, []);

  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // Milestone targets
  const authDone = !loading;
  const dataDone = authDone && (session ? hasUsername !== null : true);
  let target = 0.12;          // mounted
  if (authDone) target = 0.45;
  if (dataDone) target = 0.72;
  // Hold just shy of full until the minimum time has passed, then complete.
  if (mapReady) target = minElapsed ? 1 : 0.9;

  // Animate the bar toward the current target; fade out once it fills.
  useEffect(() => {
    Animated.timing(progress, {
      toValue: target,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && target >= 1) {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }).start(() => setHidden(true));
      }
    });
  }, [target, progress, opacity]);

  // Once data is ready, give the map a brief moment to report — otherwise
  // (non-map route / slow GPS) complete anyway.
  useEffect(() => {
    if (!dataDone) return;
    const t = setTimeout(() => setMapReady(true), 1600);
    return () => clearTimeout(t);
  }, [dataDone]);

  // Absolute safety cap — never leave the user on the splash.
  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const markMapReady = useCallback(() => setMapReady(true), []);

  return (
    <SplashCtx.Provider value={{ markMapReady }}>
      {children}
      {!hidden && (
        <Animated.View style={[StyleSheet.absoluteFill, s.overlay, { opacity }]}>
          <SplashContent progress={progress} />
        </Animated.View>
      )}
    </SplashCtx.Provider>
  );
}

const s = StyleSheet.create({
  overlay: { zIndex: 999, elevation: 999 },
  bg: {
    flex: 1,
    backgroundColor: '#070a14', // matches the artwork's dark edges
  },
  barTrack: {
    position: 'absolute',
    top: '66%',
    alignSelf: 'center',
    width: 200,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(111,224,230,0.18)',
    overflow: 'hidden',
  },
  barFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: TEAR_BLUE,
  },
});
