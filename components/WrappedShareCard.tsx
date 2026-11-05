/**
 * WrappedShareCard — the 9:16 image people post to their story.
 *
 * This is the growth engine, so it was designed before the rest of the recap:
 * everything else exists to lead here. Rules it follows:
 *   - AGGREGATE ONLY. Counts, labels, percentages. Never a note, a coordinate,
 *     a photo or a country name — this leaves the app and goes public.
 *   - Readable as a thumbnail. One hero number, a few supporting stats, huge
 *     type, high contrast.
 *   - Branded. The watermark is the whole point of sharing it.
 *
 * Rendered off-screen and captured to PNG by app/wrapped.tsx (see captureRef).
 */
import { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import type { WrappedData, WrappedExtras } from '../lib/wrapped';
import { EmotionIcon } from './EmotionIcon';
import { Tear } from './EmotionIcon';

const BG = '#070a14';
const INK = '#ffffff';
const MUTED = '#8fa3b0';

export interface ShareCardProps {
  data: WrappedData;
  extras: WrappedExtras;
  /** Shown small under the watermark; omit to keep it fully anonymous. */
  username?: string | null;
  width: number;
}

function Stat({ value, label, tint }: { value: string; label: string; tint?: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, tint ? { color: tint } : null]} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export const WrappedShareCard = forwardRef<View, ShareCardProps>(
  ({ data, extras, username, width }, ref) => {
    const height = Math.round((width * 16) / 9);
    const accent = data.topEmotion?.color ?? '#6fe0e6';
    // Same rule as the deck: one cry is a time, not a pattern.
    const night = data.total >= 3 ? data.timeOfDay.dominant : null;
    const month = data.busiestMonth && data.busiestMonth.count >= 2 ? data.busiestMonth : null;

    return (
      <View ref={ref} collapsable={false} style={[s.card, { width, height }]}>
        {/* Emotion-tinted glow behind the content */}
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="32%" r="75%">
              <Stop offset="0" stopColor={accent} stopOpacity="0.30" />
              <Stop offset="0.55" stopColor={accent} stopOpacity="0.07" />
              <Stop offset="1" stopColor={BG} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill={BG} />
          <Rect x="0" y="0" width={width} height={height} fill="url(#glow)" />
        </Svg>

        <View style={s.inner}>
          {/* Header */}
          <View>
            <Text style={s.eyebrow}>YOUR YEAR IN TEARS</Text>
            <Text style={[s.year, { color: accent }]}>{data.year}</Text>
          </View>

          {/* Hero */}
          <View style={s.hero}>
            <Text style={s.heroNumber}>{data.total}</Text>
            <Text style={s.heroLabel}>
              {data.total === 1 ? 'cry logged' : 'cries logged'}
            </Text>
            {data.topEmotion && (
              <View style={[s.emotionPill, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
                <EmotionIcon emotion={data.topEmotion.id} size={22} />
                <Text style={[s.emotionText, { color: accent }]}>
                  {data.topEmotion.pct}% {data.topEmotion.label}
                </Text>
              </View>
            )}
          </View>

          {/* Supporting stats — two rows of two */}
          <View style={s.grid}>
            <Stat
              value={night ? `${night.emoji} ${night.label}` : '—'}
              label="when it hit hardest"
            />
            <Stat
              value={month ? month.label : '—'}
              label="heaviest month"
            />
            <Stat
              value={data.daysLogged > 0 ? `${data.daysLogged}` : '—'}
              label={data.daysLogged === 1 ? 'day logged' : 'days logged'}
            />
            <Stat
              value={extras.hugsReceived > 0 ? `${extras.hugsReceived}` : `${data.spectrum.length}`}
              label={extras.hugsReceived > 0 ? 'hugs received' : 'emotions felt'}
            />
          </View>

          {/* Watermark */}
          <View style={s.footer}>
            <View style={s.brand}>
              <Tear size={20} filled color={accent} />
              <Text style={s.brandName}>Teardrop</Text>
            </View>
            <Text style={s.brandTag}>
              {username ? `@${username}` : 'Map your emotional journey'}
            </Text>
          </View>
        </View>
      </View>
    );
  },
);

WrappedShareCard.displayName = 'WrappedShareCard';

const s = StyleSheet.create({
  card: { backgroundColor: BG, overflow: 'hidden', borderRadius: 0 },
  inner: { flex: 1, paddingHorizontal: 34, paddingTop: 54, paddingBottom: 40, justifyContent: 'space-between' },

  eyebrow: { color: MUTED, fontSize: 13, letterSpacing: 3, fontFamily: 'monospace' },
  year: { fontSize: 62, fontWeight: '800', letterSpacing: -2, marginTop: 2 },

  hero: { alignItems: 'flex-start' },
  heroNumber: { color: INK, fontSize: 108, fontWeight: '800', letterSpacing: -5, lineHeight: 112 },
  heroLabel: { color: MUTED, fontSize: 20, marginTop: -2 },
  emotionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 9, marginTop: 22,
  },
  emotionText: { fontSize: 17, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  stat: {
    width: '46%', paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#1c2733',
  },
  statValue: { color: INK, fontSize: 20, fontWeight: '700' },
  statLabel: { color: MUTED, fontSize: 13, fontFamily: 'monospace', marginTop: 3, letterSpacing: 0.4 },

  footer: { gap: 4 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { color: INK, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  brandTag: { color: MUTED, fontSize: 13, fontFamily: 'monospace' },
});
