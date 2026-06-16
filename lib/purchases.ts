/**
 * lib/purchases.ts — RevenueCat wrapper
 *
 * Platform-specific: iOS + Android — selects the store-appropriate RevenueCat
 * public SDK key at runtime (appl_… on iOS, goog_…/test_… on Android).
 *
 * Wraps react-native-purchases so the rest of the app never imports
 * the SDK directly (easier to mock / swap out later).
 *
 * Product IDs (must match what's created in App Store Connect / Play Console):
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

const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

// Active key for the current platform. iOS ships a live Apple key (appl_…);
// Android currently ships a Test Store key until the live Play key is ready.
const RC_API_KEY = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;

export const ENTITLEMENT_ID = 'teardrop_pro';
const CRYSTAL_TEAR = '💎';

/**
 * RevenueCat's SDK *deliberately crashes the app* if a `test_` (Test Store) API key
 * is used in a release / non-debuggable build — it posts a dialog and then calls
 * SimulatedStoreErrorDialogActivity.crashApp(). This happens asynchronously on the
 * main looper, so a try/catch around configure() can't stop it. So we skip
 * configuration entirely whenever the active platform's key is a test key in a
 * release build, or when no key is configured at all. Premium then falls back to
 * the DB is_premium flag.
 */
const IS_TEST_KEY = RC_API_KEY.startsWith('test_');
const RC_DISABLED = (IS_TEST_KEY && !__DEV__) || !RC_API_KEY;

// ─── Initialise (call once at app start, after auth resolves) ─────────────────

let _rcConfigured = false;

export function initPurchases(userId?: string) {
  try {
    if (RC_DISABLED) {
      console.warn('[purchases] RevenueCat disabled (no live key for this platform in release build). Premium falls back to DB flag.');
      return;
    }
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    if (!_rcConfigured) {
      Purchases.configure({ apiKey: RC_API_KEY, appUserID: userId ?? null });
      _rcConfigured = true;
    } else if (userId) {
      // Already configured — just switch user ID without re-configuring
      Purchases.logIn(userId).catch(() => {});
    }
  } catch (e) {
    console.warn('[purchases] init error:', e);
  }
}

// ─── Entitlement check ────────────────────────────────────────────────────────

/**
 * Module-level cache so checkPremium() only hits the network once per session.
 * Invalidated on sign-in / sign-out via invalidatePremiumCache().
 */
let _premiumCache: boolean | null = null;

/** Immediate cached value — safe to call synchronously, defaults to false. */
export function getPremiumCache(): boolean {
  return _premiumCache ?? false;
}

/** Call on SIGNED_IN / SIGNED_OUT to force a fresh check next time. */
export function invalidatePremiumCache(): void {
  _premiumCache = null;
}

const RC_TIMEOUT_MS = 4000;

/**
 * Returns true if user has active premium.
 * Returns cached result immediately on subsequent calls (no network).
 * Checks RevenueCat first (with 4s timeout); falls back to DB is_premium flag.
 */
export async function checkPremium(): Promise<boolean> {
  // Return cached value instantly — avoids blocking UI on repeated calls
  if (_premiumCache !== null) return _premiumCache;

  // 1. Try RevenueCat with a timeout so a slow/dead network doesn't block the UI.
  //    Skipped entirely when RC is disabled (test key in release) — go straight to DB.
  if (!RC_DISABLED) {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RC timeout')), RC_TIMEOUT_MS)
      );
      const info = await Promise.race([Purchases.getCustomerInfo(), timeout]) as CustomerInfo;
      if (ENTITLEMENT_ID in info.entitlements.active) {
        _premiumCache = true;
        return true;
      }
    } catch {
      // RC not configured, unavailable, or timed out — fall through to DB check
    }
  }

  // 2. Fallback: check DB is_premium flag (dev / sandbox mode)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { _premiumCache = false; return false; }
    const { data } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', session.user.id)
      .single();
    _premiumCache = data?.is_premium === true;
    return _premiumCache;
  } catch {
    _premiumCache = false;
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
    // Dev-only sandbox: grant premium via DB flag — blocked in production builds
    if (!__DEV__) {
      console.warn('[purchases] No live RevenueCat products configured');
      return 'error';
    }
    console.log('[purchases] DEV: No live package — granting premium via DB flag');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase
          .from('profiles')
          .update({ is_premium: true })
          .eq('id', session.user.id);
        await syncCrystalTear(session.user.id);
      }
    } catch (e) {
      console.warn('[purchases] sandbox grant error:', e);
    }
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
