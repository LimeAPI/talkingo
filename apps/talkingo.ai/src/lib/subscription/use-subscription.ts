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

import { authFetch } from '@/lib/api/auth-fetch'

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'none'
export type SubscriptionProvider = 'stripe' | 'dodopayments'

export interface SubscriptionInfo {
  status: SubscriptionStatus
  plan?: 'monthly' | 'yearly'
  customerId?: string
  trialEndsAt?: number
  currentPeriodEnd?: number
  /** True when the user has cancelled but still has access until the period end */
  cancelAtPeriodEnd?: boolean
  /** Provider for this subscription (stripe or dodopayments). Optional for backwards-compat. */
  provider?: SubscriptionProvider
  /** Timestamp of last server verification */
  verifiedAt?: number
}

const STORAGE_KEY = 'talkingo_subscription'
const VERIFY_INTERVAL = 1000 * 60 * 60 // Re-verify every hour
/** Cross-device freshness window: cached state older than this is re-hydrated before gating access (14.2). */
const HYDRATION_STALE_MS = 1000 * 60 // 60 seconds

/** Returns a trimmed non-empty string, or undefined when blank/absent. */
function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

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

/**
 * Canonical access-granting predicate (Req 11.8 — cancellation grace).
 *
 * A subscription grants full access when its status is `active`/`trialing`.
 * When the subscriber has scheduled cancellation (`cancelAtPeriodEnd === true`),
 * access is retained only while the current time is *before* the period end —
 * i.e. cancelled-but-not-expired states keep access, and once the period end is
 * reached (or passed) the grace window closes.
 *
 * This is a pure function of a subscription snapshot so it can be evaluated for
 * any state (server snapshot or local cache) without reading global storage.
 *
 * @param info The subscription snapshot to evaluate.
 * @param now  Current time in epoch ms (defaults to `Date.now()`).
 */
export function hasActiveAccess(
  info: Pick<SubscriptionInfo, 'status' | 'cancelAtPeriodEnd' | 'currentPeriodEnd'>,
  now: number = Date.now(),
): boolean {
  const isLiveStatus = info.status === 'active' || info.status === 'trialing'
  if (!isLiveStatus) return false

  // Cancelled-but-not-expired: retain access only while before the period end.
  if (info.cancelAtPeriodEnd && typeof info.currentPeriodEnd === 'number') {
    return now < info.currentPeriodEnd
  }

  return true
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
 * Re-hydrate subscription state from the server (Appwrite source of truth).
 * Resolves with the authoritative snapshot, or rejects when verification
 * could not be completed (network error / unreachable endpoint) so callers
 * can retain the last-known cache and surface a verification error (14.5).
 */
async function hydrateFromServer(userId?: string | null): Promise<SubscriptionInfo> {
  const info = getSubscriptionInfo(userId)

  // Unified billing status (supports Stripe and Dodo Payments)
  const res = await authFetch('/api/billing/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  // Backwards-compat: if unified endpoint is missing, fall back to Stripe
  const json = res.ok ? await res.json() : await (async () => {
    const fallback = await authFetch('/api/stripe/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return fallback.ok ? await fallback.json() : null
  })()

  // Both endpoints unreachable/failed — treat as a verification failure so the
  // caller keeps the cached value rather than silently dropping the subscription.
  if (!json) throw new Error('subscription_verification_failed')
  if (json.status === 'none' && !info.customerId) return info

  const updated: SubscriptionInfo = {
    status: json.status || 'none',
    plan: json.plan,
    customerId: json.customerId || info.customerId,
    trialEndsAt: json.trialEndsAt,
    currentPeriodEnd: json.currentPeriodEnd,
    cancelAtPeriodEnd: json.cancelAtPeriodEnd ?? false,
    provider: json.provider as SubscriptionProvider | undefined,
    verifiedAt: Date.now(),
  }
  saveSubscriptionInfo(updated, userId)
  return updated
}

/**
 * Verify subscription status with the server.
 * Call on app load and periodically.
 *
 * Non-throwing: on any failure the last-known cached state is retained and
 * returned (the UI should keep granting access it previously had).
 */
export async function verifySubscription(userId?: string | null): Promise<SubscriptionInfo> {
  try {
    return await hydrateFromServer(userId)
  } catch {
    return getSubscriptionInfo(userId)
  }
}

/**
 * Result of a cross-device re-hydration attempt.
 */
export interface HydrationResult {
  /** The subscription snapshot to use (fresh from the server, or the retained cache). */
  info: SubscriptionInfo
  /** True when re-hydration could not be completed and the cached value was retained (14.5). */
  verificationError: boolean
}

/**
 * Whether the client-cached subscription snapshot is older than the 60s
 * freshness window and should be re-hydrated before gating access (14.2).
 * A cache with no recorded verification time is always considered stale.
 */
export function isSubscriptionCacheStale(userId?: string | null): boolean {
  const info = getSubscriptionInfo(userId)
  if (info.status === 'none') return false // Never subscribed — nothing to re-hydrate.
  if (!info.verifiedAt) return true
  return Date.now() - info.verifiedAt > HYDRATION_STALE_MS
}

/**
 * Re-hydrate subscription state from Appwrite when the cached snapshot is older
 * than 60 seconds (14.2). Intended to be called before evaluating access for a
 * subscription-gated action.
 *
 * On hydration failure the last-known cached state is retained and a
 * `verificationError` flag is surfaced rather than dropping the subscription (14.5).
 */
export async function rehydrateIfStale(userId?: string | null): Promise<HydrationResult> {
  const cached = getSubscriptionInfo(userId)
  if (!isSubscriptionCacheStale(userId)) {
    return { info: cached, verificationError: false }
  }

  try {
    const info = await hydrateFromServer(userId)
    return { info, verificationError: false }
  } catch {
    // Retain the last-known cache; surface that verification could not complete.
    return { info: cached, verificationError: true }
  }
}

/**
 * Sync subscription state from Appwrite Account Preferences.
 * Called on login to hydrate localStorage from the server-side source of truth.
 * This handles cross-device sync (e.g., subscribed on phone, opens on desktop).
 *
 * Reads the canonical `providerCustomerId` first, falling back to the legacy
 * provider-specific customer ids (`stripeCustomerId` / `dodopaymentsCustomerId`)
 * for documents written before the canonical migration (14.1). When neither a
 * canonical nor a legacy customer id is present, the account is treated as
 * having no active subscription and the stored cache is left unchanged (14.4).
 */
export function syncFromAccountPrefs(prefs: {
  // Canonical fields
  subscriptionProvider?: SubscriptionProvider
  providerCustomerId?: string
  // Legacy provider-specific fields (fallback when canonical is absent)
  stripeCustomerId?: string
  dodopaymentsCustomerId?: string
  subscriptionStatus?: string
  subscriptionPlan?: string
  subscriptionTrialEnd?: number
  subscriptionPeriodEnd?: number
}, userId?: string | null): SubscriptionInfo {
  // 14.1: canonical-first, legacy-fallback customer id resolution.
  const customerId =
    nonEmpty(prefs.providerCustomerId) ??
    nonEmpty(prefs.stripeCustomerId) ??
    nonEmpty(prefs.dodopaymentsCustomerId)

  // 14.4: no canonical and no legacy customer id → no active subscription;
  // leave the stored cache unchanged (do not overwrite localStorage).
  if (!customerId || !prefs.subscriptionStatus) {
    return { status: 'none' }
  }

  // Resolve provider: canonical field first, otherwise infer from the legacy id present.
  const provider: SubscriptionProvider | undefined =
    prefs.subscriptionProvider ??
    (nonEmpty(prefs.stripeCustomerId)
      ? 'stripe'
      : nonEmpty(prefs.dodopaymentsCustomerId)
        ? 'dodopayments'
        : undefined)

  const info: SubscriptionInfo = {
    status: (prefs.subscriptionStatus as SubscriptionStatus) || 'none',
    plan: (prefs.subscriptionPlan as 'monthly' | 'yearly') || undefined,
    customerId,
    trialEndsAt: prefs.subscriptionTrialEnd,
    currentPeriodEnd: prefs.subscriptionPeriodEnd,
    provider,
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

// ─── Trial / period helpers (UI conversion levers) ──────────────────────────

/**
 * Days remaining in the trial. Returns null if not in trial or no trialEndsAt.
 * Floors to whole days; e.g. 1.4 days remaining → 1.
 */
export function getTrialDaysRemaining(userId?: string | null): number | null {
  const info = getSubscriptionInfo(userId)
  if (info.status !== 'trialing' || !info.trialEndsAt) return null
  const ms = info.trialEndsAt - Date.now()
  if (ms <= 0) return 0
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

/**
 * Hours remaining (used when < 1 day left, e.g. "Trial ends in 6 hours").
 */
export function getTrialHoursRemaining(userId?: string | null): number | null {
  const info = getSubscriptionInfo(userId)
  if (info.status !== 'trialing' || !info.trialEndsAt) return null
  const ms = info.trialEndsAt - Date.now()
  if (ms <= 0) return 0
  return Math.floor(ms / (60 * 60 * 1000))
}

/**
 * Pretty trial countdown for UI: "Trial ends in 4 days" / "...6 hours" / "...today".
 * Returns null if not in trial.
 */
export function getTrialCountdownLabel(userId?: string | null): string | null {
  const days = getTrialDaysRemaining(userId)
  if (days === null) return null
  if (days >= 1) return `Trial ends in ${days} day${days === 1 ? '' : 's'}`
  const hours = getTrialHoursRemaining(userId)
  if (hours === null) return null
  if (hours >= 1) return `Trial ends in ${hours} hour${hours === 1 ? '' : 's'}`
  return 'Trial ends today'
}

/**
 * Cancellation banner label for users who cancelled but still have access.
 * Returns null when there's nothing to show.
 */
export function getCancellationLabel(userId?: string | null): string | null {
  const info = getSubscriptionInfo(userId)
  if (!info.cancelAtPeriodEnd || !info.currentPeriodEnd) return null
  const ms = info.currentPeriodEnd - Date.now()
  if (ms <= 0) return null
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  if (days >= 1) return `Cancels in ${days} day${days === 1 ? '' : 's'}`
  return 'Cancels today'
}

/**
 * Format the next billing date as a human-readable string.
 */
export function getNextBillingLabel(userId?: string | null): string | null {
  const info = getSubscriptionInfo(userId)
  const ts = info.currentPeriodEnd
  if (!ts) return null
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return null
  }
}
