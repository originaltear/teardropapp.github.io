/**
 * lib/purchases.ts — RevenueCat wrapper
 *
 * Wraps react-native-purchases so the rest of the app never imports
 * the SDK directly (easier to mock / swap out later).
 *
 * Product IDs (must match what's created in App Store / Play Store):
 *   teardrop_premium_monthly
 *   teardrop_premium_yearly
 *   teardrop_premium_lifetime
 *
 * Entitlement: teardrop_pro
 */

import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
  type CustomerInfo,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const RC_API_KEY_ANDROID = 'test_TOoVoNDzemlfNlJfiJxFoLpuGPB';
export const ENTITLEMENT_ID = 'teardrop_pro';
const CRYSTAL_TEAR = '💎';

// ─── Initialise (call once at app start, after auth resolves) ─────────────────

export function initPurchases(userId?: string) {
  try {
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    if (Platform.OS === 'android') {
      Purchases.configure({ apiKey: RC_API_KEY_ANDROID, appUserID: userId ?? null });
    }
    // iOS key added here when ready:
    // if (Platform.OS === 'ios') Purchases.configure({ apiKey: 'ios_key', appUserID: userId });
  } catch (e) {
    console.warn('[purchases] init error:', e);
  }
}

// ─── Entitlement check ────────────────────────────────────────────────────────

export async function checkPremium(): Promise<boolean> {
  try {
    const info: CustomerInfo = await Purchases.getCustomerInfo();
    return ENTITLEMENT_ID in info.entitlements.active;
  } catch {
    return false;
  }
}

// ─── Offerings ────────────────────────────────────────────────────────────────

export interface PlanOption {
  pkg: PurchasesPackage | null;   // null = use placeholder price
  identifier: string;
  title: string;
  price: string;
  period: string;
  badge?: string;
}

/** Hardcoded fallback plans shown when RevenueCat offerings aren't available. */
export const FALLBACK_PLANS: PlanOption[] = [
  {
    pkg: null,
    identifier: 'teardrop_premium_monthly',
    title: 'Monthly',
    price: '$2.99',
    period: 'per month',
  },
  {
    pkg: null,
    identifier: 'teardrop_premium_yearly',
    title: 'Yearly',
    price: '$19.99',
    period: 'per year',
    badge: 'Best Value',
  },
  {
    pkg: null,
    identifier: 'teardrop_premium_lifetime',
    title: 'Lifetime',
    price: '$49.99',
    period: 'one-time',
    badge: 'Early Supporter',
  },
];

export async function getPlans(): Promise<PlanOption[]> {
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current?.availablePackages?.length) return FALLBACK_PLANS;

    return current.availablePackages.map(pkg => {
      const id = pkg.product.identifier;
      const fallback = FALLBACK_PLANS.find(p => p.identifier === id);
      return {
        pkg,
        identifier: id,
        title: fallback?.title ?? pkg.product.title,
        price: pkg.product.priceString,
        period: fallback?.period ?? '',
        badge: fallback?.badge,
      };
    });
  } catch {
    return FALLBACK_PLANS;
  }
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

export type PurchaseResult = 'success' | 'cancelled' | 'error';

export async function purchasePlan(plan: PlanOption): Promise<PurchaseResult> {
  if (!plan.pkg) {
    // Sandbox / no live product yet — simulate success in dev
    console.log('[purchases] No live package — sandbox purchase skipped');
    return 'success';
  }
  try {
    await Purchases.purchasePackage(plan.pkg);
    return 'success';
  } catch (e: any) {
    if (e.userCancelled) return 'cancelled';
    console.warn('[purchases] purchase error:', e.message);
    return 'error';
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases();
    return ENTITLEMENT_ID in info.entitlements.active;
  } catch {
    return false;
  }
}

// ─── Crystal Tear sync ────────────────────────────────────────────────────────

/**
 * Called at login and on app focus.
 * Adds 💎 to selected_tears if premium, removes it if not.
 * selected_tears has a max of 3 — if full, replaces the last non-premium tear.
 */
export async function syncCrystalTear(userId: string): Promise<void> {
  try {
    const isPremium = await checkPremium();
    const { data: profile } = await supabase
      .from('profiles')
      .select('earned_tears, selected_tears')
      .eq('id', userId)
      .single();
    if (!profile) return;

    let earned: string[]   = profile.earned_tears   ?? [];
    let selected: string[] = profile.selected_tears ?? [];

    if (isPremium) {
      // Ensure 💎 is in earned_tears
      if (!earned.includes(CRYSTAL_TEAR)) earned = [CRYSTAL_TEAR, ...earned];

      // Ensure 💎 is in selected_tears (max 3, replace last if full)
      if (!selected.includes(CRYSTAL_TEAR)) {
        if (selected.length < 3) {
          selected = [CRYSTAL_TEAR, ...selected];
        } else {
          // Replace last entry with Crystal Tear
          selected = [CRYSTAL_TEAR, ...selected.slice(0, 2)];
        }
      }
    } else {
      // Not premium — remove Crystal Tear
      earned   = earned.filter(t => t !== CRYSTAL_TEAR);
      selected = selected.filter(t => t !== CRYSTAL_TEAR);
    }

    await supabase
      .from('profiles')
      .update({ earned_tears: earned, selected_tears: selected })
      .eq('id', userId);
  } catch (e) {
    console.warn('[purchases] syncCrystalTear error:', e);
  }
}
