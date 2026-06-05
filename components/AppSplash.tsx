/**
 * Animated splash / loading screen.
 *
 * The native splash (a static dark screen) shows instantly while the JS bundle
 * loads. As soon as React mounts, this overlay takes over with the full branded
 * design + a thin Tear Blue progress bar that reflects REAL startup progress:
 *
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
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path, Ellipse, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useAuth } from '../lib/auth';

const BG = '#070a14';
const TEAR_BLUE = '#6fe0e6';

// ─── Context so the map can report when it's ready ────────────────────────────

const SplashCtx = createContext<{ markMapReady: () => void }>({ markMapReady: () => {} });
export function useSplashGate() { return useContext(SplashCtx); }

// ─── Branded logo (glossy teardrop in a dark rounded tile) ────────────────────

function Logo() {
  return (
    <View style={s.logoTile}>
      <Svg width={62} height={66} viewBox="0 0 100 106">
        <Defs>
          <LinearGradient id="drop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#c8f7fb" />
            <Stop offset="0.5" stopColor={TEAR_BLUE} />
            <Stop offset="1" stopColor="#3bbecd" />
          </LinearGradient>
        </Defs>
        {/* water-drop body */}
        <Path
          d="M50 8 C32 40 19 54 19 70 a31 31 0 1 0 62 0 C81 54 68 40 50 8 Z"
          fill="url(#drop)"
        />
        {/* glossy highlight */}
        <Ellipse cx={38} cy={60} rx={10} ry={15} fill="#ffffff" opacity={0.25} />
      </Svg>
    </View>
  );
}

// ─── Visual content ───────────────────────────────────────────────────────────

function SplashContent({ progress }: { progress: Animated.Value }) {
  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });
  return (
    <View style={s.root}>
      <Logo />
      <Text style={s.title}>Teardrop</Text>
      <Text style={s.tagline}>Every Tear Has A Place</Text>
      <View style={s.barTrack}>
        <Animated.View style={[s.barFill, { width }]} />
      </View>
    </View>
  );
}

// ─── Gate: drives progress from real milestones, overlays the app ─────────────

export function SplashGate({ children }: { children: React.ReactNode }) {
  const { loading, hasUsername, session } = useAuth();
  const [mapReady, setMapReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // Milestone targets
  const authDone = !loading;
  const dataDone = authDone && (session ? hasUsername !== null : true);
  let target = 0.12;          // mounted
  if (authDone) target = 0.45;
  if (dataDone) target = 0.72;
  if (mapReady) target = 1;

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
  root: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTile: {
    width: 112,
    height: 112,
    borderRadius: 26,
    backgroundColor: '#0e1a2e',
    borderWidth: 1,
    borderColor: 'rgba(111,224,230,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    shadowColor: TEAR_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    color: TEAR_BLUE,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tagline: {
    color: '#7d94a8',
    fontSize: 15,
    letterSpacing: 0.4,
    marginTop: 6,
  },
  barTrack: {
    width: 200,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(111,224,230,0.15)',
    overflow: 'hidden',
    marginTop: 30,
  },
  barFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: TEAR_BLUE,
  },
});
