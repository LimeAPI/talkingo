import 'server-only'

/**
 * DodoPayments → Appwrite subscription sync.
 *
 * Placeholder for the full DodoPayments webhook + post-checkout sync logic.
 * Will be used by:
 *   - The DodoPayments webhook handler (real-time events)
 *   - The post-checkout sync endpoint (immediately after user returns)
 *   - Cancel/upgrade endpoints (user actions in our UI)
 *
 * Pattern mirrors src/lib/stripe/sync.ts — same Appwrite destination,
 * different source provider.
 */

import { upsertSubscription, updateUserPrefs, logSubscriptionEvent } from '@/lib/appwrite-server'

export type DodoStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'

export interface DodoSubscriptionInfo {
  id: string
  customerId: string
  status: DodoStatus
  plan: 'monthly' | 'yearly'
  trialEnd?: number
  periodEnd?: number
  cancelAtPeriodEnd: boolean
}

/**
 * Persist a DodoPayments subscription's current state into Appwrite.
 * Writes both the `subscriptions` collection and the user's Account Prefs.
 *
 * Called by the DodoPayments webhook and post-checkout sync endpoint.
 */
export async function syncDodoSubscriptionToAppwrite(params: {
  userId: string
  customerId: string
  subscription: DodoSubscriptionInfo
}): Promise<void> {
  const { userId, customerId, subscription } = params

  const now = Date.now()

  await upsertSubscription(userId, {
    dodopaymentsCustomerId: customerId,
    dodopaymentsSubscriptionId: subscription.id,
    provider: 'dodopayments',
    status: subscription.status,
    plan: subscription.plan,
    trialEnd: subscription.trialEnd,
    periodEnd: subscription.periodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    updatedAt: now,
  })

  await updateUserPrefs(userId, {
    dodopaymentsCustomerId: customerId,
    dodopaymentsSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionPlan: subscription.plan,
    ...(subscription.trialEnd && { subscriptionTrialEnd: subscription.trialEnd }),
    ...(subscription.periodEnd && { subscriptionPeriodEnd: subscription.periodEnd }),
    subscriptionUpdatedAt: now,
  })

  // Audit log: record every state change for support & reconciliation
  logSubscriptionEvent({
    userId,
    eventType: 'dodopayments_subscription_synced',
    stripeEventId: subscription.id,
    subscriptionId: subscription.id,
    customerId,
    newStatus: subscription.status,
    plan: subscription.plan,
    timestamp: now,
  }).catch(() => {}) // fire-and-forget
}

// ───────────────────────────────────────────────────────────────────────────
// Unified-layer helpers (task 6.1)
//
// The functions below bridge the existing DodoPayments integration into the
// provider-agnostic unified payment layer. They convert a live Dodo
// subscription object into a `UnifiedSubscription` and persist it through the
// shared, race-safe `syncToAppwrite` writer (the same path Stripe uses), so
// both providers behave identically from the application's point of view.
// ───────────────────────────────────────────────────────────────────────────

import { dodo } from './client'
import { DODOPAYMENTS_PRODUCTS } from './env'
import { syncToAppwrite } from '@/lib/payments/sync'
import type { UnifiedStatus, UnifiedSubscription } from '@/lib/payments/provider'

/**
 * Map any DodoPayments status string to a provider-agnostic `UnifiedStatus`.
 *
 * The live SDK reports `pending | active | on_hold | cancelled | failed |
 * expired`; webhook/legacy payloads may also use spellings like `trialing`,
 * `past_due`, or `incomplete_expired`. Unknown values normalize to
 * `incomplete` so a state is never silently dropped.
 */
export function mapDodoStatusToUnified(raw: string | undefined | null): UnifiedStatus {
  const s = (raw ?? '').toString().toLowerCase().trim()
  if (s === 'active' || s === 'succeeded' || s === 'paid' || s === 'renewed') return 'active'
  if (s === 'trialing' || s === 'trial' || s === 'in_trial') return 'trialing'
  if (
    s === 'on_hold' ||
    s === 'past_due' ||
    s === 'past-due' ||
    s === 'payment_failed' ||
    s === 'failed'
  )
    return 'past_due'
  if (s === 'unpaid') return 'unpaid'
  if (s === 'cancelled' || s === 'canceled' || s === 'cancel_at_period_end') return 'canceled'
  if (s === 'expired' || s === 'terminated' || s === 'incomplete_expired' || s === 'incomplete-expired')
    return 'expired'
  if (s === 'pending' || s === 'incomplete') return 'incomplete'
  return 'incomplete'
}

/**
 * Robustly coerce a Dodo timestamp into epoch-milliseconds.
 *
 * Dodo dates arrive in several shapes across API versions and payloads:
 *   - ISO-8601 strings (`next_billing_date` on the live subscription object)
 *   - epoch seconds (older webhook payloads)
 *   - epoch milliseconds
 * Returns `undefined` for missing/invalid input.
 */
export function toEpochMs(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic: values below ~Sat 2001 in ms are almost certainly seconds.
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    const asNumber = Number(trimmed)
    if (Number.isFinite(asNumber)) {
      return asNumber < 1e12 ? Math.round(asNumber * 1000) : Math.round(asNumber)
    }
    const parsed = Date.parse(trimmed)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

/**
 * Namespace prefix for DodoPayments webhook event ids in the shared idempotency
 * store. Stripe uses `stripe:` so the two can never collide (Requirement 8.8 +
 * design → "Idempotency key namespacing").
 */
export const DODO_WEBHOOK_ID_NAMESPACE = 'dodopayments'

/**
 * Derive a STABLE, provider-namespaced webhook event id from the composite of
 * `subscriptionId + type + periodEnd` (Requirement 8.8). The id is a pure
 * function of its inputs, so retries of the same event produce an identical id
 * and de-duplicate in the idempotency store — replacing the old random-id
 * fallback. `periodEnd` is normalized through `toEpochMs` (an empty string when
 * absent/invalid) so equivalent timestamp encodings collapse to one id.
 *
 * The result is namespaced as `dodopayments:${subscriptionId}:${type}:${periodEndMs}`,
 * which can never equal a `stripe:`-namespaced id.
 */
export function deriveDodoWebhookEventId(
  subscriptionId: string,
  type: string,
  periodEnd: unknown,
): string {
  const periodEndMs = toEpochMs(periodEnd) ?? ''
  return `${DODO_WEBHOOK_ID_NAMESPACE}:${subscriptionId}:${type}:${periodEndMs}`
}

/** Is `productId` one of our configured Dodo subscription products? Guards against tampered checkouts. */
export function isKnownDodoProduct(productId: string | undefined | null): boolean {
  if (!productId) return false
  try {
    return productId === DODOPAYMENTS_PRODUCTS.monthly || productId === DODOPAYMENTS_PRODUCTS.yearly
  } catch {
    // Env not configured → nothing is a known product.
    return false
  }
}

/** Infer the billing plan from a live Dodo subscription (product id first, then interval). */
export function detectDodoPlan(live: any): 'monthly' | 'yearly' {
  const productId = live?.product_id
  try {
    if (productId && productId === DODOPAYMENTS_PRODUCTS.yearly) return 'yearly'
    if (productId && productId === DODOPAYMENTS_PRODUCTS.monthly) return 'monthly'
  } catch {
    // fall through to interval inspection
  }
  const interval = (
    live?.subscription_period_interval ??
    live?.plan ??
    live?.price?.interval ??
    ''
  )
    .toString()
    .toLowerCase()
  return interval === 'year' || interval === 'yearly' || interval === 'annual' ? 'yearly' : 'monthly'
}

/**
 * Build a `UnifiedSubscription` snapshot from a live Dodo subscription object.
 *
 * Callers may override fields the live object cannot authoritatively provide
 * (e.g. the customer id when only the legacy stored value is known, the plan
 * after an explicit plan change, or the `cancelAtPeriodEnd` flag right after a
 * cancel/reactivate call before Dodo reflects it).
 */
export function buildUnifiedFromDodoSubscription(
  live: any,
  overrides?: {
    customerId?: string
    plan?: 'monthly' | 'yearly'
    status?: UnifiedStatus
    cancelAtPeriodEnd?: boolean
    updatedAt?: number
  },
): UnifiedSubscription {
  const customerId = String(
    live?.customer?.customer_id ??
      live?.customer_id ??
      live?.customerId ??
      overrides?.customerId ??
      '',
  )
  const subscriptionId = String(live?.subscription_id ?? live?.id ?? '')
  const cancelAtPeriodEnd =
    overrides?.cancelAtPeriodEnd ??
    (live?.cancel_at_next_billing_date as boolean | undefined) ??
    (live?.cancel_at_period_end as boolean | undefined) ??
    false

  return {
    provider: 'dodopayments',
    providerCustomerId: customerId,
    providerSubscriptionId: subscriptionId || undefined,
    status: overrides?.status ?? mapDodoStatusToUnified(live?.status),
    plan: overrides?.plan ?? detectDodoPlan(live),
    trialEnd: toEpochMs(live?.trial_end ?? live?.trialEnd),
    periodEnd: toEpochMs(live?.next_billing_date ?? live?.current_period_end ?? live?.period_end),
    cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
    updatedAt: overrides?.updatedAt ?? Date.now(),
  }
}

/**
 * Return-from-checkout sync for DodoPayments — the mirror of Stripe's
 * `syncFromCheckoutSession`, feeding the same idempotent `syncToAppwrite`
 * writer so a paid subscription is never "lost".
 *
 * For Dodo the `sessionId` is the subscription id created by `createCheckout`
 * (which uses the subscription payment-link flow). We retrieve the live
 * subscription so we can enforce ownership and reject tampered prices — the
 * checkout-session retrieve endpoint does not expose those fields.
 *
 * Behaviour (see design → "Return-from-checkout sync"):
 *   - Ownership: the subscription's `metadata.userId` must equal the requester,
 *     otherwise we throw and grant nothing.
 *   - Pending: when the subscription is not yet confirmed (still `pending` /
 *     payment incomplete) we return `null` so the route replies 202 and the
 *     webhook finalizes it.
 *   - Tampered price: the subscription's `product_id` must be a configured
 *     product, otherwise we throw and grant nothing.
 *   - Idempotent: repeated calls produce the same end state via `syncToAppwrite`.
 */
export async function syncFromDodoCheckout(params: {
  userId: string
  sessionId: string
}): Promise<UnifiedSubscription | null> {
  const { userId, sessionId } = params

  const live: any = await dodo.subscriptions.retrieve(sessionId)

  // Ownership check — only the user who created the checkout may sync it.
  const ownerId = live?.metadata?.userId ?? live?.metadata?.user_id
  if (ownerId !== userId) {
    throw new Error('Session does not belong to this user')
  }

  // Only sync once payment is confirmed — the webhook finalizes pending payments.
  const status = mapDodoStatusToUnified(live?.status)
  const confirmed = status === 'active' || status === 'trialing'
  if (!confirmed) return null

  // Reject tampered sessions that reference an unknown product/price.
  if (!isKnownDodoProduct(live?.product_id)) {
    console.warn(
      `[dodo-sync] Unknown product ${live?.product_id} — rejecting tampered session`,
    )
    throw new Error('Invalid subscription price')
  }

  const unified = buildUnifiedFromDodoSubscription(live, { updatedAt: Date.now() })
  if (!unified.providerCustomerId || !unified.providerSubscriptionId) return null

  await syncToAppwrite(userId, unified)
  return unified
}
