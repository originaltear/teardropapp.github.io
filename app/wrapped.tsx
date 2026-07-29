/**
 * "Your Year in Tears" — /wrapped
 *
 * A swipeable, Spotify-Wrapped-style recap of the user's year. Free for
 * everyone: the shareable card at the end is a growth channel, not a perk.
 *
 * Ships dark — nothing links here until `app_config.wrapped_enabled` is turned
 * on (see lib/wrapped.ts), so the December launch needs no new build.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  useWindowDimensions, Alert, Animated, Pressable, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { loadCries, type Cry } from '../lib/storage';
import { useAuth } from '../lib/auth';
import {
  computeWrapped, getWrappedExtras, getWrappedRank, currentWrappedYear,
  type WrappedData, type WrappedExtras, type WrappedRank,
} from '../lib/wrapped';
import {
  totalComment, emotionComment, timeComment,
  streakComment, geoComment, closingComment,
} from '../lib/wrapped-comments';
import { WrappedCard } from '../components/WrappedCard';
import { WrappedShareCard } from '../components/WrappedShareCard';
import { WrappedConfetti } from '../components/WrappedConfetti';
import { success, selection } from '../lib/haptics';

const BG = '#070a14';
const INK = '#e8eef7';
const MUTED = '#8fa3b0';
const DEFAULT_ACCENT = '#6fe0e6';

/** How long each card holds before advancing itself. */
const CARD_DURATION_MS = 5200;

// ─── Small building blocks ────────────────────────────────────────────────────

/**
 * Counts from 0 up to `target` once the card becomes active. Driven by rAF and
 * plain state because the value is *text* — the native driver can't animate
 * glyphs, only transforms/opacity. Cheap: one card is active at a time.
 */
function useCountUp(target: number, active: boolean, delay = 380, duration = 1100) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) { setValue(0); return; }
    let raf = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);   // easeOutCubic — fast, then settles
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => { raf = requestAnimationFrame(step); }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, active, delay, duration]);

  return value;
}

function BigNumber({ value, color, active }: { value: number; color?: string; active: boolean }) {
  const shown = useCountUp(value, active);
  return <Text style={[s.bigNumber, color ? { color } : null]}>{shown}</Text>;
}

/** Springs in from nothing — used for the one big emoji on emotion/time cards. */
function PopIn({ children, active, delay = 300 }: { children: React.ReactNode; active: boolean; delay?: number }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) { scale.setValue(0); return; }
    const t = setTimeout(() => {
      Animated.spring(scale, {
        toValue: 1, friction: 5, tension: 90, useNativeDriver: true,
      }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [active, delay, scale]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

/** Horizontal bar that grows out from its left edge. */
function Bar({ pct, color, label, value, active, index = 0 }: {
  pct: number; color: string; label: string; value: string; active: boolean; index?: number;
}) {
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) { grow.setValue(0); return; }
    Animated.timing(grow, {
      toValue: 1,
      duration: 620,
      delay: 380 + index * 90,   // cascade down the list
      useNativeDriver: true,
    }).start();
  }, [active, grow, index]);

  return (
    <View style={s.barRow}>
      <Text style={s.barLabel} numberOfLines={1}>{label}</Text>
      <View style={s.barTrack}>
        <Animated.View
          style={[
            s.barFill,
            {
              width: `${Math.max(pct, 2)}%`,
              backgroundColor: color,
              transform: [{ scaleX: grow }],
              transformOrigin: 'left',
            },
          ]}
        />
      </View>
      <Text style={s.barValue}>{value}</Text>
    </View>
  );
}

/** Vertical bar for the month chart — grows up from the baseline. */
function MonthBar({ height, color, active, index }: {
  height: number; color: string; active: boolean; index: number;
}) {
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) { grow.setValue(0); return; }
    Animated.timing(grow, {
      toValue: 1,
      duration: 520,
      delay: 360 + index * 45,
      useNativeDriver: true,
    }).start();
  }, [active, grow, index]);

  return (
    <Animated.View
      style={[
        s.monthBar,
        {
          height,
          backgroundColor: color,
          transform: [{ scaleY: grow }],
          transformOrigin: 'bottom',
        },
      ]}
    />
  );
}

/** One counting stat in the "you were not alone" row. */
function ReceivedStat({ value, label, color, active, delay }: {
  value: number; label: string; color: string; active: boolean; delay: number;
}) {
  const shown = useCountUp(value, active, delay, 900);
  return (
    <View style={s.receivedItem}>
      <Text style={[s.receivedValue, { color }]}>{shown}</Text>
      <Text style={s.receivedLabel}>{label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WrappedScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { width } = useWindowDimensions();

  const [cries, setCries] = useState<Cry[]>([]);
  const [extras, setExtras] = useState<WrappedExtras>({
    hugsReceived: 0, likesReceived: 0, achievementsUnlocked: 0,
  });
  const [rank, setRank] = useState<WrappedRank>({
    country: null, globalTopPct: null, countryTopPct: null,
  });
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [paused, setPaused] = useState(false);

  const shareRef = useRef<View>(null);
  const listRef = useRef<FlatList<any>>(null);
  const year = currentWrappedYear();

  // Fill of the current progress segment. JS-driven (not the native driver) so
  // stopAnimation can hand back the exact value when the user holds to pause.
  const progress = useRef(new Animated.Value(0)).current;
  const pausedAt = useRef(0);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [c, e, r] = await Promise.all([
          loadCries(), getWrappedExtras(year), getWrappedRank(year),
        ]);
        if (cancelled) return;
        setCries(c);
        setExtras(e);
        setRank(r);
      } catch (err) {
        console.warn('[wrapped] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year, session?.user.id]));

  const data: WrappedData = useMemo(() => computeWrapped(cries, year), [cries, year]);
  const seed = { userId: session?.user.id ?? 'guest', year };
  const accent = data.topEmotion?.color ?? DEFAULT_ACCENT;

  // ── Share ──
  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(shareRef, { format: 'png', quality: 1 });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot share files.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `My ${year} in tears`,
        UTI: 'public.png',
      });
      success();
    } catch (e) {
      console.warn('[wrapped] share failed:', e);
      Alert.alert('Could not share', 'Something went wrong creating your card. Please try again.');
    } finally {
      setSharing(false);
    }
  }

  // ── Cards ──
  const cards = useMemo(() => {
    if (!data.hasEnough) return [];
    const list: { key: string; render: (active: boolean) => React.ReactNode }[] = [];

    list.push({
      key: 'intro',
      render: active => (
        <WrappedCard active={active} accent={accent} eyebrow={`${year} · Teardrop`} variant="center">
          <Text style={s.introTitle}>Your Year{'\n'}in Tears</Text>
          <Text style={s.introSub}>A look back at everything you felt.</Text>
        </WrappedCard>
      ),
    });

    list.push({
      key: 'total',
      render: active => (
        <WrappedCard
          active={active} accent={accent} eyebrow="This year you logged"
          caption={totalComment(data.total, seed)} variant="center"
        >
          <BigNumber value={data.total} color={accent} active={active} />
          <Text style={s.heroUnit}>{data.total === 1 ? 'cry' : 'cries'}</Text>
        </WrappedCard>
      ),
    });

    if (data.topEmotion) {
      list.push({
        key: 'emotion',
        render: active => (
          <WrappedCard
            active={active} accent={data.topEmotion!.color} eyebrow="Your defining emotion"
            caption={emotionComment(data.topEmotion!.id, seed)} variant="flood"
          >
            <PopIn active={active}>
              <Text style={s.emotionBig}>{data.topEmotion!.emoji}</Text>
            </PopIn>
            <Text style={[s.emotionName, { color: data.topEmotion!.color }]}>
              {data.topEmotion!.label}
            </Text>
            <Text style={s.heroUnit}>
              {data.topEmotion!.pct}% of your year · {data.topEmotion!.count} times
            </Text>
          </WrappedCard>
        ),
      });
    }

    if (data.timeOfDay.dominant) {
      const d = data.timeOfDay.dominant;
      list.push({
        key: 'time',
        render: active => (
          <WrappedCard
            active={active} accent={accent} eyebrow="Your hour"
            caption={timeComment(d.id, seed)}
          >
            <PopIn active={active}>
              <Text style={s.emotionBig}>{d.emoji}</Text>
            </PopIn>
            <Text style={[s.emotionName, { color: accent }]}>{d.label}</Text>
            <Text style={s.heroUnit}>
              {d.pct}% of your cries
              {data.timeOfDay.peakHour !== null
                ? ` · peak at ${String(data.timeOfDay.peakHour).padStart(2, '0')}:00`
                : ''}
            </Text>
          </WrappedCard>
        ),
      });
    }

    if (data.spectrum.length > 1) {
      list.push({
        key: 'spectrum',
        render: active => (
          <WrappedCard
            active={active} accent={accent} eyebrow="Your emotional spectrum"
            caption={`${data.spectrum.length} different feelings this year.`}
          >
            <View style={s.bars}>
              {data.spectrum.slice(0, 6).map((e, i) => (
                <Bar
                  key={e.id}
                  index={i}
                  active={active}
                  pct={data.spectrum[0].count > 0 ? (e.count / data.spectrum[0].count) * 100 : 0}
                  color={e.color}
                  label={`${e.emoji} ${e.label}`}
                  value={String(e.count)}
                />
              ))}
            </View>
          </WrappedCard>
        ),
      });
    }

    if (data.busiestMonth) {
      const max = Math.max(...data.monthly.map(m => m.value), 1);
      list.push({
        key: 'month',
        render: active => (
          <WrappedCard
            active={active} accent={accent} eyebrow="Your heaviest month"
            caption={`${data.busiestMonth!.count} cries in a single month.`}
          >
            <Text style={[s.emotionName, { color: accent }]}>{data.busiestMonth!.label}</Text>
            <View style={s.monthChart}>
              {data.monthly.map((m, i) => (
                <View key={m.label} style={s.monthCol}>
                  <MonthBar
                    index={i}
                    active={active}
                    height={Math.max((m.value / max) * 110, 3)}
                    color={m.label === data.busiestMonth!.label ? accent : '#1c2733'}
                  />
                  <Text style={s.monthLabel}>{m.short[0]}</Text>
                </View>
              ))}
            </View>
          </WrappedCard>
        ),
      });
    }

    if (data.countries.length > 0) {
      list.push({
        key: 'geo',
        render: active => (
          <WrappedCard
            active={active} accent={accent} eyebrow="Where it happened"
            caption={geoComment(data.countries.length, seed)} variant="center"
          >
            <BigNumber value={data.countries.length} color={accent} active={active} />
            <Text style={s.heroUnit}>
              {data.countries.length === 1 ? 'country' : 'countries'}
            </Text>
            <View style={s.countryList}>
              {data.countries.slice(0, 4).map(c => (
                <Text key={c.name} style={s.countryItem}>{c.name} · {c.count}</Text>
              ))}
            </View>
          </WrappedCard>
        ),
      });
    }

    if (data.longestStreak > 1) {
      list.push({
        key: 'streak',
        render: active => (
          <WrappedCard
            active={active} accent={accent} eyebrow="Your longest streak"
            caption={streakComment(data.longestStreak, seed)} variant="flood"
          >
            <BigNumber value={data.longestStreak} color={accent} active={active} />
            <Text style={s.heroUnit}>days in a row</Text>
          </WrappedCard>
        ),
      });
    }

    // Percentile card — only once enough people share the scope for the number
    // to be meaningful (the RPC returns null below its thresholds).
    if (rank.countryTopPct !== null || rank.globalTopPct !== null) {
      const primary = rank.countryTopPct ?? rank.globalTopPct!;
      const inCountry = rank.countryTopPct !== null;
      list.push({
        key: 'rank',
        render: active => (
          <WrappedCard
            active={active} accent={accent} eyebrow="Compared to everyone else"
            variant="center"
            caption={
              inCountry && rank.globalTopPct !== null
                ? `And top ${rank.globalTopPct}% worldwide.`
                : 'You are not as alone in this as it feels.'
            }
          >
            <Text style={s.rankLead}>You are in the</Text>
            <View style={s.rankRow}>
              <Text style={[s.rankTop, { color: accent }]}>top</Text>
              <BigNumber value={primary} color={accent} active={active} />
              <Text style={[s.rankTop, { color: accent }]}>%</Text>
            </View>
            <Text style={s.heroUnit}>
              {inCountry ? `of criers in ${rank.country}` : 'of criers worldwide'}
            </Text>
          </WrappedCard>
        ),
      });
    }

    if (extras.hugsReceived + extras.likesReceived + extras.achievementsUnlocked > 0) {
      list.push({
        key: 'received',
        render: active => (
          <WrappedCard
            active={active} accent={accent} eyebrow="You were not alone"
            caption="People showed up for you this year." variant="center"
          >
            <View style={s.receivedRow}>
              <ReceivedStat value={extras.hugsReceived} label="🫂 hugs" color={accent} active={active} delay={380} />
              <ReceivedStat value={extras.likesReceived} label="💧 drops" color={accent} active={active} delay={500} />
              <ReceivedStat value={extras.achievementsUnlocked} label="🏆 unlocked" color={accent} active={active} delay={620} />
            </View>
          </WrappedCard>
        ),
      });
    }

    list.push({
      key: 'closing',
      render: active => (
        <WrappedCard
          active={active} accent={accent} eyebrow="That was your year"
          caption={closingComment(seed)} variant="center"
        >
          {/* Teardrops in this year's own emotion colours rain over the finale */}
          <WrappedConfetti
            run={active}
            colors={data.spectrum.slice(0, 5).map(e => e.color)}
          />
          <Text style={s.introTitle}>{year}</Text>
          <TouchableOpacity
            style={[s.shareBtn, { backgroundColor: accent }, sharing && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={sharing}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share your year"
          >
            {sharing
              ? <ActivityIndicator color="#0d1117" />
              : <Text style={s.shareBtnTxt}>Share your year</Text>}
          </TouchableOpacity>
        </WrappedCard>
      ),
    });

    return list;
  }, [data, extras, rank, accent, sharing, year, seed]);

  // ── Story playback ──
  const lastIndex = cards.length - 1;

  const goTo = useCallback((next: number) => {
    if (next < 0 || next > lastIndex) return;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
    selection();
  }, [lastIndex]);

  // A new card always starts its timer from scratch.
  useEffect(() => {
    progress.setValue(0);
    pausedAt.current = 0;
  }, [index, progress]);

  // Fill the segment, then advance. Holding pauses and keeps the position, so
  // letting go resumes rather than restarting. The last card never auto-advances
  // — it holds on the share button.
  useEffect(() => {
    if (loading || !data.hasEnough || index >= lastIndex) return;

    if (paused) {
      progress.stopAnimation(v => { pausedAt.current = v; });
      return;
    }

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: CARD_DURATION_MS * (1 - pausedAt.current),
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => { if (finished) goTo(index + 1); });
    return () => anim.stop();
  }, [index, paused, loading, data.hasEnough, lastIndex, goTo, progress]);

  // ── Render ──

  if (loading) {
    return (
      <View style={s.fill}>
        <ActivityIndicator size="large" color={DEFAULT_ACCENT} />
      </View>
    );
  }

  if (!data.hasEnough) {
    return (
      <SafeAreaView style={s.fill} edges={['top', 'bottom']}>
        <View style={s.emptyWrap}>
          <Text style={s.emptyEmoji}>💧</Text>
          <Text style={s.emptyTitle}>Not enough yet</Text>
          <Text style={s.emptySub}>
            Log a few more cries this year and your recap will be waiting here.
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={s.emptyBtnTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.fill}>
      <FlatList
        ref={listRef}
        data={cards}
        keyExtractor={c => c.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={e => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) { setIndex(i); selection(); }
        }}
        renderItem={({ item, index: i }) => (
          <View style={{ width }}>
            {item.render(i === index)}
            {/* Tap left/right to move, hold to pause. Lives inside the row so
                the horizontal scroll can still steal the gesture on a drag —
                an overlay outside the list would kill swiping. Skipped on the
                last card so the share button stays tappable. */}
            {i !== lastIndex && (
              <View style={s.tapRow}>
                <Pressable
                  style={s.tapZoneBack}
                  onPress={() => goTo(i - 1)}
                  onLongPress={() => setPaused(true)}
                  onPressOut={() => setPaused(false)}
                  delayLongPress={220}
                  accessibilityRole="button"
                  accessibilityLabel="Previous"
                />
                <Pressable
                  style={s.tapZoneNext}
                  onPress={() => goTo(i + 1)}
                  onLongPress={() => setPaused(true)}
                  onPressOut={() => setPaused(false)}
                  delayLongPress={220}
                  accessibilityRole="button"
                  accessibilityLabel="Next"
                />
              </View>
            )}
          </View>
        )}
      />

      {/* Progress segments */}
      <SafeAreaView edges={['top']} style={s.progressWrap} pointerEvents="box-none">
        <View style={s.progressRow}>
          {cards.map((c, i) => (
            <View key={c.key} style={s.segment}>
              <Animated.View
                style={[
                  s.segmentFill,
                  {
                    backgroundColor: accent,
                    transformOrigin: 'left',
                    transform: [{ scaleX: i === index ? progress : i < index ? 1 : 0 }],
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close your year in tears"
        >
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Off-screen share card — laid out (so it can be captured) but never seen */}
      <View style={s.offscreen} pointerEvents="none">
        <WrappedShareCard ref={shareRef} data={data} extras={extras} width={width} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BG, alignItems: 'stretch', justifyContent: 'center' },

  introTitle: { color: INK, fontSize: 46, fontWeight: '800', letterSpacing: -1.5, lineHeight: 52 },
  introSub: { color: MUTED, fontSize: 17, marginTop: 10 },

  bigNumber: { color: INK, fontSize: 92, fontWeight: '800', letterSpacing: -4, lineHeight: 96 },
  heroUnit: { color: MUTED, fontSize: 18 },

  emotionBig: { fontSize: 62 },
  emotionName: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },

  bars: { gap: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: INK, fontSize: 13, width: 118 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#131c26', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barValue: { color: MUTED, fontSize: 12, width: 28, textAlign: 'right', fontFamily: 'monospace' },

  monthChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 18, height: 130 },
  monthCol: { flex: 1, alignItems: 'center', gap: 6 },
  monthBar: { width: '100%', borderRadius: 3 },
  monthLabel: { color: MUTED, fontSize: 10, fontFamily: 'monospace' },

  countryList: { marginTop: 14, gap: 4 },
  countryItem: { color: MUTED, fontSize: 15 },

  rankLead: { color: MUTED, fontSize: 19, textAlign: 'center' },
  rankRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rankTop: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },

  receivedRow: { flexDirection: 'row', gap: 22, marginTop: 6 },
  receivedItem: { gap: 4 },
  receivedValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  receivedLabel: { color: MUTED, fontSize: 13 },

  shareBtn: {
    marginTop: 26, borderRadius: 999, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  shareBtnTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },

  progressWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 10 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#22303d', overflow: 'hidden' },
  segmentFill: { width: '100%', height: '100%', borderRadius: 2 },

  tapRow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  tapZoneBack: { flex: 1 },
  tapZoneNext: { flex: 2 },
  closeBtn: { alignSelf: 'flex-end', padding: 14 },
  closeTxt: { color: MUTED, fontSize: 20 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyEmoji: { fontSize: 54 },
  emptyTitle: { color: INK, fontSize: 24, fontWeight: '700' },
  emptySub: { color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { marginTop: 14, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, backgroundColor: '#1c2733' },
  emptyBtnTxt: { color: INK, fontSize: 15, fontWeight: '600' },

  // Rendered far off-screen: still laid out (captureRef needs a real view),
  // never visible, never interactive.
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
});
