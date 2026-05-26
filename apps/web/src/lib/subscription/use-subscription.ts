/**
 * Subscription status management.
 *
 * Two-layer verification:
 * 1. localStorage for instant UI (no flicker on load)
 * 2. Server check on app load (syncs with Stripe via Appwrite)
 *
 * The source of truth is Stripe → Webhook → Appwrite → Client.
 * localStorage is just a cache for instant rendering.
 */

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'none'

export interface SubscriptionInfo {
  status: SubscriptionStatus
  plan?: 'monthly' | 'yearly'
  customerId?: string
  trialEndsAt?: number
  currentPeriodEnd?: number
  /** Timestamp of last server verification */
  verifiedAt?: number
}

const STORAGE_KEY = 'talkingo_subscription'
const VERIFY_INTERVAL = 1000 * 60 * 60 // Re-verify every hour

function getStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY
}

export function getSubscriptionInfo(userId?: string | null): SubscriptionInfo {
  if (typeof window === 'undefined') return { status: 'none' }
  try {
    const stored = localStorage.getItem(getStorageKey(userId))
    if (!stored) return { status: 'none' }
    return JSON.parse(stored)
  } catch {
    return { status: 'none' }
  }
}

export function saveSubscriptionInfo(info: SubscriptionInfo, userId?: string | null): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(getStorageKey(userId), JSON.stringify({ ...info, verifiedAt: Date.now() }))
}

export function isSubscribed(userId?: string | null): boolean {
  const info = getSubscriptionInfo(userId)
  return info.status === 'active' || info.status === 'trialing'
}

export function needsServerVerification(userId?: string | null): boolean {
  const info = getSubscriptionInfo(userId)
  if (info.status === 'none') return false // Never subscribed — no need to verify
  if (!info.verifiedAt) return true
  return Date.now() - info.verifiedAt > VERIFY_INTERVAL
}

export function clearSubscription(userId?: string | null): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(getStorageKey(userId))
}

/**
 * Verify subscription status with the server.
 * Call on app load and periodically.
 */
export async function verifySubscription(userId?: string | null): Promise<SubscriptionInfo> {
  const info = getSubscriptionInfo(userId)

  try {
    // The status route now checks Appwrite DB first (fast, no Stripe API call)
    // Falls back to Stripe if customerId is provided
    const res = await fetch('/api/stripe/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: info.customerId || undefined }),
    })
    if (!res.ok) return info

    const serverInfo = await res.json()
    if (serverInfo.status === 'none' && !info.customerId) return info

    const updated: SubscriptionInfo = {
      status: serverInfo.status || 'none',
      plan: serverInfo.plan,
      customerId: serverInfo.customerId || info.customerId,
      trialEndsAt: serverInfo.trialEndsAt,
      currentPeriodEnd: serverInfo.currentPeriodEnd,
      verifiedAt: Date.now(),
    }
    saveSubscriptionInfo(updated, userId)
    return updated
  } catch {
    return info
  }
}

/**
 * Sync subscription state from Appwrite Account Preferences.
 * Called on login to hydrate localStorage from the server-side source of truth.
 * This handles cross-device sync (e.g., subscribed on phone, opens on desktop).
 */
export function syncFromAccountPrefs(prefs: {
  stripeCustomerId?: string
  subscriptionStatus?: string
  subscriptionPlan?: string
  subscriptionTrialEnd?: number
  subscriptionPeriodEnd?: number
}, userId?: string | null): SubscriptionInfo {
  if (!prefs.stripeCustomerId || !prefs.subscriptionStatus) {
    return { status: 'none' }
  }

  const info: SubscriptionInfo = {
    status: (prefs.subscriptionStatus as SubscriptionStatus) || 'none',
    plan: (prefs.subscriptionPlan as 'monthly' | 'yearly') || undefined,
    customerId: prefs.stripeCustomerId,
    trialEndsAt: prefs.subscriptionTrialEnd,
    currentPeriodEnd: prefs.subscriptionPeriodEnd,
    verifiedAt: Date.now(),
  }

  saveSubscriptionInfo(info, userId)
  return info
}

/**
 * Check if subscription is in an expired/canceled state that needs re-subscribe.
 */
export function isExpired(userId?: string | null): boolean {
  const info = getSubscriptionInfo(userId)
  return info.status === 'expired' || info.status === 'canceled'
}

/**
 * Check if subscription has a payment issue.
 */
export function isPastDue(userId?: string | null): boolean {
  const info = getSubscriptionInfo(userId)
  return info.status === 'past_due'
}

