/**
 * Paywall screen — /paywall
 * Opens as a modal from Settings or when a premium feature is tapped.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  getPlans, purchasePlan, restorePurchases,
  type PlanOption,
} from '../lib/purchases';
import { useTheme } from '../lib/themes';

const PERKS = [
  { icon: '🚫', label: 'Ad-free experience' },
  { icon: '💎', label: 'Crystal Tear emblem' },
  { icon: '📊', label: 'Pro Analytics' },
  { icon: '🎨', label: 'Custom themes (Crimson, Forest, Dusk)' },
];

export default function PaywallScreen() {
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const [plans, setPlans]         = useState<PlanOption[]>([]);
  const [selected, setSelected]   = useState<string>('teardrop_premium_yearly');
  const [loading, setLoading]     = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getPlans().then(p => {
      setPlans(p);
      setLoading(false);
    });
  }, []);

  async function handlePurchase() {
    const plan = plans.find(p => p.identifier === selected);
    if (!plan) return;
    setPurchasing(true);
    const result = await purchasePlan(plan);
    setPurchasing(false);
    if (result === 'success') {
      Alert.alert('Welcome to Teardrop Pro! 💎', 'Your Crystal Tear has been unlocked.', [
        { text: 'Nice!', onPress: () => router.back() },
      ]);
    } else if (result === 'error') {
      Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
    }
    // 'cancelled' — do nothing
  }

  async function handleRestore() {
    setRestoring(true);
    const hasPro = await restorePurchases();
    setRestoring(false);
    if (hasPro) {
      Alert.alert('Restored!', 'Your Pro subscription has been restored.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      Alert.alert('Nothing to restore', 'No active purchases found for this account.');
    }
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>

      {/* Close */}
      <TouchableOpacity style={s.closeBtn} onPress={() => router.back()} activeOpacity={0.7}>
        <Text style={s.closeTxt}>✕</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <Text style={s.crown}>💎</Text>
        <Text style={s.heroTitle}>Teardrop Pro</Text>
        <Text style={s.heroSub}>Everything you need to go deeper.</Text>

        {/* Perks */}
        <View style={s.perksCard}>
          {PERKS.map(p => (
            <View key={p.label} style={s.perkRow}>
              <Text style={s.perkIcon}>{p.icon}</Text>
              <Text style={s.perkLabel}>{p.label}</Text>
            </View>
          ))}
        </View>

        {/* Plans */}
        {loading ? (
          <ActivityIndicator color={accent} style={{ marginVertical: 32 }} />
        ) : (
          <View style={s.plans}>
            {plans.map(plan => {
              const sel = selected === plan.identifier;
              return (
                <TouchableOpacity
                  key={plan.identifier}
                  style={[s.planCard, sel && { borderColor: accent, backgroundColor: accent + '08' }]}
                  onPress={() => setSelected(plan.identifier)}
                  activeOpacity={0.8}
                >
                  {plan.badge && (
                    <View style={s.badge}>
                      <Text style={s.badgeTxt}>{plan.badge}</Text>
                    </View>
                  )}
                  <View style={s.planLeft}>
                    <View style={[s.radio, sel && { borderColor: accent }]}>
                      {sel && <View style={[s.radioDot, { backgroundColor: accent }]} />}
                    </View>
                    <Text style={[s.planTitle, sel && s.planTitleActive]}>{plan.title}</Text>
                  </View>
                  <View style={s.planRight}>
                    <Text style={[s.planPrice, sel && { color: accent }]}>{plan.price}</Text>
                    <Text style={s.planPeriod}>{plan.period}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={[s.cta, { backgroundColor: accent }, purchasing && { opacity: 0.6 }]}
          onPress={handlePurchase}
          disabled={purchasing || loading}
          activeOpacity={0.85}
        >
          {purchasing
            ? <ActivityIndicator color="#0d1117" />
            : <Text style={s.ctaTxt}>Get Pro</Text>}
        </TouchableOpacity>

        <Text style={s.legalNote}>
          Prices are in USD. Payment charged to your Google Play / App Store account.
          Subscriptions auto-renew unless cancelled at least 24 hours before the end of the period.
        </Text>

        {/* Restore */}
        <TouchableOpacity onPress={handleRestore} disabled={restoring} activeOpacity={0.7}>
          {restoring
            ? <ActivityIndicator color="#4a5568" />
            : <Text style={s.restoreTxt}>Restore purchases</Text>}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  scroll: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },

  closeBtn: {
    position: 'absolute', top: 56, right: 20, zIndex: 10,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: '#94a3b8', fontSize: 16 },

  crown: { fontSize: 64, marginTop: 36, marginBottom: 12 },
  heroTitle: { color: '#e2e8f0', fontSize: 30, fontWeight: '800', marginBottom: 6 },
  heroSub: { color: '#4a5568', fontSize: 15, marginBottom: 28, textAlign: 'center' },

  perksCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 16, borderWidth: 1, borderColor: '#1f2937',
    paddingVertical: 8, paddingHorizontal: 20, marginBottom: 24,
    gap: 4,
  },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  perkIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  perkLabel: { color: '#94a3b8', fontSize: 15 },

  plans: { width: '100%', gap: 10, marginBottom: 24 },
  planCard: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#1f2937',
    paddingHorizontal: 18, paddingVertical: 16,
  },
  planCardActive: { borderColor: '#6fe0e6', backgroundColor: '#6fe0e608' },
  badge: {
    position: 'absolute', top: -10, right: 16,
    backgroundColor: '#6fe0e6', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeTxt: { color: '#0d1117', fontSize: 10, fontWeight: '800' },
  planLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: '#6fe0e6' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6fe0e6' },
  planTitle: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  planTitleActive: { color: '#e2e8f0' },
  planRight: { alignItems: 'flex-end' },
  planPrice: { color: '#94a3b8', fontSize: 17, fontWeight: '700' },
  planPriceActive: { color: '#6fe0e6' },
  planPeriod: { color: '#374151', fontSize: 11, fontFamily: 'monospace' },

  cta: {
    width: '100%', backgroundColor: '#6fe0e6',
    borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', marginBottom: 16,
  },
  ctaTxt: { color: '#0d1117', fontSize: 17, fontWeight: '800' },

  legalNote: {
    color: '#374151', fontSize: 11, textAlign: 'center',
    lineHeight: 16, marginBottom: 20, paddingHorizontal: 8,
  },
  restoreTxt: { color: '#4a5568', fontSize: 14, fontWeight: '500', paddingVertical: 8 },
});
