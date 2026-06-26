/**
 * StripeProvider — adapter that implements the `PaymentProvider` interface
 * over the existing hardened Stripe integration.
 *
 * This is a *thin adapter*: every operation delegates to the already-hardened
 * Stripe code that previously lived in `src/lib/stripe/*` and the `/api/stripe/*`
 * route handlers. No Stripe business logic is rewritten here — the provider
 * simply wraps that logic behind the provider-agnostic `PaymentProvider`
 * surface and translates Stripe's shapes into the `UnifiedSubscription` model.
 *
 * Mapping of interface methods → reused Stripe code:
 *   - isEnabled        → `STRIPE_ENV` proxy (credential presence)
 *   - createCheckout   → logic from `/api/stripe/checkout` (customer pre-create +
 *                        `incomplete` upsert + Checkout Session create)
 *   - syncFromCheckout → `syncFromCheckoutSession` (ownership + tampered-price gates)
 *   - getStatus        → `getSubscription` + `toUnified` mapper
 *   - cancel           → logic from `/api/stripe/cancel`
 *   - reactivate       → logic from `/api/stripe/reactivate`
 *   - changePlan       → logic from `/api/stripe/change-plan`
 *   - verifyWebhook    → `stripe.webhooks.constructEvent` + event normalization
 *   - reconcile        → logic from `/api/stripe/reconcile`
 *   - getManageUrl     → logic from `/api/stripe/portal`
 *
 * Persistence of provider-agnostic state flows through the shared, race-safe
 * `syncToAppwrite` writer so canonical + legacy fields stay in sync.
 *
 * Server-only Appwrite/Stripe-sync modules are pulled in via dynamic `import()`
 * inside each method (mirroring `payments/sync.ts`) so this module — which the
 * registry imports — never drags `server-only` code into a client bundle.
 *
 * _Requirements: 1.2, 1.5, 5.11, 11.1, 11.6, 10.4_
 */

import type Stripe from 'stripe'
import { stripe } from '../stripe/client'
import { STRIPE_ENV } from '../stripe/env'
import { PLANS } from '../stripe/plans'
import { syncToAppwrite } from './sync'
import { normalizeStatus, toUnified } from './subscription-mapper'
import type {
  CheckoutParams,
  CheckoutResult,
  NormalizedEvent,
  PaymentProvider,
  ProviderId,
  UnifiedStatus,
  UnifiedSubscription,
} from './provider'

// ─── Status + shape mapping helpers ─────────────────────────────────────────

/**
 * Map a raw Stripe subscription status to a provider-agnostic `UnifiedStatus`.
 * `incomplete_expired` collapses to `expired`; `paused` is treated as `past_due`
 * (access-limited); anything unrecognized normalizes to `incomplete` (never dropped).
 */
function mapStripeStatus(status: string): UnifiedStatus {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
      return status
    case 'incomplete_expired':
      return 'expired'
    case 'paused':
      return 'past_due'
    default:
      return normalizeStatus(status)
  }
}

/** Read a Stripe epoch-seconds field (snake_case, possibly missing) as epoch-ms. */
function epochMs(value: unknown): number | undefined {
  return typeof value === 'number' ? value * 1000 : undefined
}

/**
 * Translate a live `Stripe.Subscription` into a `UnifiedSubscription`.
 * `plan` is supplied by the caller (computed via `detectPlanFromSubscription`)
 * so this helper stays synchronous and pure. `statusOverride` lets callers force
 * a terminal status (e.g. `expired` for `customer.subscription.deleted`).
 */
function unifiedFromStripe(
  sub: Stripe.Subscription,
  customerId: string,
  plan: 'monthly' | 'yearly',
  statusOverride?: UnifiedStatus,
): UnifiedSubscription {
  return {
    provider: 'stripe',
    providerCustomerId: customerId,
    providerSubscriptionId: sub.id,
    status: statusOverride ?? mapStripeStatus(sub.status),
    plan,
    trialEnd: epochMs(sub.trial_end),
    periodEnd: epochMs((sub as unknown as { current_period_end?: number }).current_period_end),
    cancelAtPeriodEnd:
      (sub as unknown as { cancel_at_period_end?: boolean }).cancel_at_period_end ?? false,
    updatedAt: Date.now(),
  }
}

/** Resolve our userId from event metadata, falling back to a customer-id lookup. */
async function resolveUserId(
  metadataUserId: string | undefined,
  customerId: string | null | undefined,
): Promise<string | undefined> {
  if (metadataUserId) return metadataUserId
  if (!customerId) return undefined
  const { getSubscriptionByCustomerId } = await import('@/lib/appwrite-server')
  const existing = await getSubscriptionByCustomerId(customerId)
  return existing?.userId ?? undefined
}

const NOT_SUBSCRIBED = 'no_subscription'

/**
 * Provider-scoped Stripe customer id. Prefer the Stripe-specific legacy field;
 * fall back to the canonical field ONLY when the row's active provider is
 * Stripe. Never return another provider's customer id — passing a Dodo customer
 * id to the Stripe API throws "No such customer", which is the mirror of the
 * Dodo 404 bug.
 */
function stripeCustomerIdOf(
  doc:
    | { provider?: string; providerCustomerId?: string; stripeCustomerId?: string }
    | null
    | undefined,
): string | undefined {
  if (!doc) return undefined
  return doc.stripeCustomerId ?? (doc.provider === 'stripe' ? doc.providerCustomerId : undefined)
}

export const stripeProvider: PaymentProvider = {
  id: 'stripe' as ProviderId,

  /**
   * Stripe is enabled only when all required credentials (secret key, webhook
   * secret, and the trial/monthly/yearly price ids) are present and non-empty.
   * The `STRIPE_ENV` proxy validates every required var on first access and
   * throws if any is missing or a placeholder, so a thrown error means the
   * provider is not fully configured → disabled.
   */
  isEnabled(): boolean {
    try {
      return Boolean(
        STRIPE_ENV.STRIPE_SECRET_KEY &&
          STRIPE_ENV.STRIPE_WEBHOOK_SECRET &&
          STRIPE_ENV.STRIPE_PRICE_TRIAL &&
          STRIPE_ENV.STRIPE_PRICE_MONTHLY &&
          STRIPE_ENV.STRIPE_PRICE_YEARLY,
      )
    } catch {
      return false
    }
  },

  /**
   * Create a Stripe Checkout Session (logic from `/api/stripe/checkout`).
   *
   * Pre-creates the Stripe Customer when the user has none yet and persists an
   * `incomplete` snapshot via `syncToAppwrite` BEFORE returning the URL, so the
   * webhook can resolve userId↔customerId and the client has local state even if
   * the user abandons checkout. An existing customer is reused unchanged so prior
   * subscription state is never clobbered (Req 1.9).
   *
   * _Requirements: 1.2, 5.11_
   */
  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { userId, plan, email, idempotencyKey, appUrl } = params
    const planConfig = PLANS[plan]
    /** Recurring plans are either monthly or yearly; the trial bills as monthly. */
    const unifiedPlan: 'monthly' | 'yearly' = plan === 'yearly' ? 'yearly' : 'monthly'

    const { getSubscription } = await import('@/lib/appwrite-server')
    const existing = await getSubscription(userId)
    let customerId = stripeCustomerIdOf(existing)

    // Self-heal a stale/foreign customer id (deleted customer, or an id from a
    // different Stripe account/environment). Verify it still exists; if retrieve
    // fails or it's deleted, discard it so a fresh customer is created below
    // rather than letting `checkout.sessions.create` fail with "No such customer".
    if (customerId) {
      try {
        const c = await stripe.customers.retrieve(customerId)
        if ((c as Stripe.DeletedCustomer).deleted) customerId = undefined
      } catch {
        customerId = undefined
      }
    }

    // Pre-create the Customer before checkout so idempotency keys are per-customer,
    // the webhook can resolve userId from customerId, and the portal/future
    // sessions reuse the same customer. Persist an `incomplete` snapshot first.
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId },
        ...(email ? { email } : {}),
      })
      customerId = customer.id

      await syncToAppwrite(userId, {
        provider: 'stripe',
        providerCustomerId: customerId,
        status: 'incomplete',
        plan: unifiedPlan,
        cancelAtPeriodEnd: false,
        updatedAt: Date.now(),
      })
    }

    // Build line items: always the recurring plan, plus optional one-time fee.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    if (planConfig.oneTimePriceId) {
      lineItems.push({ price: planConfig.oneTimePriceId, quantity: 1 })
    }
    lineItems.push({ price: planConfig.recurringPriceId, quantity: 1 })

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: { userId, plan: planConfig.id },
      ...(planConfig.trialDays ? { trial_period_days: planConfig.trialDays } : {}),
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId,
      metadata: { userId, plan: planConfig.id },
      client_reference_id: userId,
      line_items: lineItems,
      subscription_data: subscriptionData,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
        },
      },
      // Canonical return URL read by CheckoutReturnHandler:
      // `?provider=&status=success&session_id=` (Requirement 6.1). Stripe
      // substitutes the real session id into {CHECKOUT_SESSION_ID}.
      success_url: `${appUrl}?provider=stripe&status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}?subscription=cancelled`,
    }

    // Stripe Tax is OPT-IN. Enabling `automatic_tax` / `tax_id_collection`
    // requires the account to have completed Stripe Tax setup (an origin
    // address + registrations); without it Stripe rejects session creation with
    // a 400 and checkout fails entirely. We only turn these on when the account
    // is known to be configured (STRIPE_AUTOMATIC_TAX=true), so the default
    // out-of-the-box flow always succeeds. `customer_update` is required by
    // Stripe whenever these are enabled and is therefore gated together.
    if (process.env.STRIPE_AUTOMATIC_TAX === 'true') {
      sessionParams.automatic_tax = { enabled: true }
      sessionParams.tax_id_collection = { enabled: true }
      sessionParams.customer_update = { address: 'auto', name: 'auto' }
    }

    // NOTE: Checkout Sessions automatically offer every eligible payment method
    // (cards, Apple Pay, Google Pay, Link, etc.) when `payment_method_types` is
    // omitted — there is no `automatic_payment_methods` parameter on Sessions
    // (that belongs to PaymentIntents). Passing it makes Stripe reject the whole
    // request with `parameter_unknown`, so we deliberately do NOT set it.
    const session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey })
    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL')
    }

    return { url: session.url, providerCustomerId: customerId }
  },

  /**
   * Pull a returned checkout session's subscription and persist it
   * (delegates to the hardened `syncFromCheckoutSession`, which asserts session
   * ownership and rejects tampered/unknown recurring prices). Returns `null`
   * while payment is still pending (the webhook will finalize). Also mirrors the
   * canonical provider fields through `syncToAppwrite`.
   *
   * _Requirements: 1.5_
   */
  async syncFromCheckout(params: {
    userId: string
    sessionId: string
  }): Promise<UnifiedSubscription | null> {
    const { syncFromCheckoutSession } = await import('@/lib/stripe/sync')
    const result = await syncFromCheckoutSession(params)
    if (!result) return null

    const unified: UnifiedSubscription = {
      provider: 'stripe',
      providerCustomerId: result.customerId,
      providerSubscriptionId: result.subscriptionId,
      status: mapStripeStatus(result.status),
      plan: result.plan,
      trialEnd: result.trialEnd,
      periodEnd: result.periodEnd,
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      updatedAt: Date.now(),
    }

    // `syncFromCheckoutSession` writes legacy fields; mirror the canonical
    // provider-agnostic fields too so the unified model stays consistent.
    await syncToAppwrite(params.userId, unified)
    return unified
  },

  /**
   * Reconcile-on-checkout. If this user's Stripe customer already has a live
   * (active / trialing / past_due / unpaid) subscription, persist it and return
   * it so the checkout route can recover a missed activation and block a
   * duplicate charge. Never throws — any lookup failure resolves to `null` so a
   * legitimate first-time checkout is never blocked.
   */
  async adoptExistingSubscription(params: {
    userId: string
    jwt?: string
  }): Promise<UnifiedSubscription | null> {
    try {
      const { getSubscription } = await import('@/lib/appwrite-server')
      const existing = await getSubscription(params.userId, params.jwt).catch(() => null)
      const customerId = stripeCustomerIdOf(existing)
      if (!customerId) return null

      const { detectPlanFromSubscription } = await import('@/lib/stripe/sync')
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10,
      })
      const live = subs.data.find((s) =>
        ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status),
      )
      if (!live) return null

      const unified = unifiedFromStripe(live, customerId, detectPlanFromSubscription(live))
      await syncToAppwrite(params.userId, unified)
      return unified
    } catch {
      // Best-effort: never block a checkout because reconcile couldn't run.
      return null
    }
  },

  /**
   * Authoritative current state for a user: read the stored document and map it
   * to a `UnifiedSubscription` (canonical-first, legacy-fallback via the mapper).
   *
   * _Requirements: 1.5_
   */
  async getStatus(params: {
    userId: string
    jwt?: string
  }): Promise<UnifiedSubscription | null> {
    const { getSubscription } = await import('@/lib/appwrite-server')
    const doc = await getSubscription(params.userId, params.jwt)
    if (!doc) return null
    return toUnified(doc)
  },

  /**
   * Schedule cancellation at period end (logic from `/api/stripe/cancel`).
   * On any Stripe error the call throws and nothing is persisted, so the prior
   * stored state is preserved (Req 1.9).
   *
   * _Requirements: 11.1_
   */
  async cancel(params: { userId: string; jwt?: string }): Promise<UnifiedSubscription> {
    const { getSubscription } = await import('@/lib/appwrite-server')
    const { detectPlanFromSubscription } = await import('@/lib/stripe/sync')

    const sub = await getSubscription(params.userId, params.jwt)
    const customerId = stripeCustomerIdOf(sub)
    if (!sub || !sub.stripeSubscriptionId || !customerId) {
      throw new Error(NOT_SUBSCRIBED)
    }

    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    const unified = unifiedFromStripe(updated, customerId, detectPlanFromSubscription(updated))
    await syncToAppwrite(params.userId, unified)
    return unified
  },

  /**
   * Undo a scheduled cancellation (logic from `/api/stripe/reactivate`).
   * Idempotent: if the subscription is not pending cancellation, the current
   * mapped state is returned without calling Stripe.
   *
   * _Requirements: 11.6_
   */
  async reactivate(params: { userId: string; jwt?: string }): Promise<UnifiedSubscription> {
    const { getSubscription } = await import('@/lib/appwrite-server')
    const { detectPlanFromSubscription } = await import('@/lib/stripe/sync')

    const sub = await getSubscription(params.userId, params.jwt)
    const customerId = stripeCustomerIdOf(sub)
    if (!sub || !sub.stripeSubscriptionId || !customerId) {
      throw new Error(NOT_SUBSCRIBED)
    }

    // Already active (not pending cancellation) → return current state unchanged.
    if (!sub.cancelAtPeriodEnd) {
      const current = toUnified(sub)
      if (current) return current
    }

    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    })

    const unified = unifiedFromStripe(updated, customerId, detectPlanFromSubscription(updated))
    await syncToAppwrite(params.userId, unified)
    return unified
  },

  /**
   * Switch monthly <-> yearly with immediate proration (logic from
   * `/api/stripe/change-plan`). Replaces the recurring line item and removes any
   * one-time leftovers (e.g. the trial fee). Idempotent when already on the
   * target plan. Errors throw without persisting, preserving prior state (Req 1.9).
   *
   * _Requirements: 10.4_
   */
  async changePlan(params: {
    userId: string
    jwt?: string
    plan: 'monthly' | 'yearly'
  }): Promise<UnifiedSubscription> {
    const { getSubscription } = await import('@/lib/appwrite-server')
    const { detectPlanFromSubscription } = await import('@/lib/stripe/sync')

    const sub = await getSubscription(params.userId, params.jwt)
    const customerId = stripeCustomerIdOf(sub)
    if (!sub || !sub.stripeSubscriptionId || !customerId) {
      throw new Error(NOT_SUBSCRIBED)
    }

    // Already on the requested plan → no-op, return current mapped state.
    if (sub.plan === params.plan) {
      const current = toUnified(sub)
      if (current) return current
    }

    const targetPlan = PLANS[params.plan]
    const liveSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId)

    const recurringItem = liveSub.items.data.find((it) => !!it.price?.recurring)
    if (!recurringItem) {
      throw new Error('No recurring item to update on this subscription.')
    }

    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      { id: recurringItem.id, price: targetPlan.recurringPriceId, quantity: 1 },
    ]
    for (const it of liveSub.items.data) {
      if (it.id !== recurringItem.id) {
        items.push({ id: it.id, deleted: true })
      }
    }

    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items,
      proration_behavior: 'always_invoice',
      metadata: { ...liveSub.metadata, plan: targetPlan.id },
    })

    const unified = unifiedFromStripe(updated, customerId, detectPlanFromSubscription(updated))
    await syncToAppwrite(params.userId, unified)
    return unified
  },

  /**
   * Verify a Stripe webhook signature over the raw body and normalize the event
   * into a `NormalizedEvent`. Throws on a missing/invalid signature (the route
   * turns that into a 400). The event id is namespaced as `stripe:${rawId}` so it
   * can never collide with a Dodo event id in the shared idempotency store.
   *
   * Subscription-lifecycle events carry a mapped `UnifiedSubscription`;
   * `checkout.session.completed` retrieves the subscription to do the same. Other
   * events (invoice/dispute/refund) expose `userId`/`customerId` so the route can
   * apply a status transition.
   */
  async verifyWebhook(
    rawBody: string,
    signature: string | null,
    _headers: Headers,
  ): Promise<NormalizedEvent> {
    if (!signature) {
      throw new Error('Missing Stripe signature')
    }

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      STRIPE_ENV.STRIPE_WEBHOOK_SECRET,
    ) as Stripe.Event

    const { detectPlanFromSubscription } = await import('@/lib/stripe/sync')
    const id = `stripe:${event.id}`
    const type = event.type

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
        const userId = await resolveUserId(sub.metadata?.userId, customerId)
        const statusOverride =
          event.type === 'customer.subscription.deleted' ? ('expired' as UnifiedStatus) : undefined
        const subscription = unifiedFromStripe(
          sub,
          customerId,
          detectPlanFromSubscription(sub),
          statusOverride,
        )
        return { id, type, userId, customerId, subscription }
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : (session.customer?.id ?? undefined)
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id
        const userId = await resolveUserId(session.metadata?.userId, customerId)

        let subscription: UnifiedSubscription | undefined
        if (subscriptionId && customerId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId)
          subscription = unifiedFromStripe(sub, customerId, detectPlanFromSubscription(sub))
        }
        return { id, type, userId, customerId, subscription }
      }

      default: {
        // Best-effort context extraction for invoice/dispute/refund/etc. events.
        const obj = event.data.object as { customer?: string | { id?: string } }
        const customerId =
          typeof obj?.customer === 'string' ? obj.customer : (obj?.customer?.id ?? undefined)
        const userId = await resolveUserId(undefined, customerId)
        return { id, type, userId, customerId }
      }
    }
  },

  /**
   * Compare every active Stripe subscription against Appwrite and fix drift
   * (logic from `/api/stripe/reconcile`). Recovers orphans (paid in Stripe but
   * missing locally) by email lookup and repairs status mismatches. Admin/cron use.
   */
  async reconcile(): Promise<{ reconciled: number; errors: number; results: string[] }> {
    const { getAdminDatabases, getAdminUsers, logSubscriptionEvent } = await import(
      '@/lib/appwrite-server'
    )
    const { syncSubscriptionToAppwrite, detectPlanFromSubscription } = await import(
      '@/lib/stripe/sync'
    )
    const { APPWRITE_DB_ID, COLLECTION_IDS } = await import('@/lib/appwrite-schema')
    const { Query } = await import('node-appwrite')

    const results: string[] = []
    let errors = 0

    let startingAfter: string | undefined
    const PAGE_SIZE = 100

    do {
      const listParams: Stripe.SubscriptionListParams = {
        limit: PAGE_SIZE,
        status: 'all',
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }
      const stripeSubs = await stripe.subscriptions.list(listParams)

      for (const stripeSub of stripeSubs.data) {
        // Only active/trialing/past_due matter; terminal states are trusted.
        if (!['active', 'trialing', 'past_due'].includes(stripeSub.status)) continue

        const customerId =
          typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id

        const db = getAdminDatabases()
        const existing = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
          Query.equal('stripeCustomerId', customerId),
          Query.limit(1),
        ])
        const appwriteSub =
          existing.documents.length > 0
            ? (existing.documents[0] as unknown as { userId: string; status: string })
            : null

        if (!appwriteSub) {
          // Orphan: paid in Stripe, missing from Appwrite — resolve by email.
          try {
            const customer = await stripe.customers.retrieve(customerId)
            if (customer.deleted || !customer.email) {
              results.push(
                `⚠️ Customer ${customerId}: Stripe sub ${stripeSub.id} active but no email to resolve`,
              )
              continue
            }
            const users = getAdminUsers()
            const appwriteUsers = await users.list([Query.equal('email', customer.email)])
            if (appwriteUsers.users.length === 0) {
              results.push(`⚠️ Customer ${customerId}: email ${customer.email} not found in Appwrite`)
              continue
            }
            const userId = appwriteUsers.users[0].$id
            await syncSubscriptionToAppwrite({ userId, customerId, subscription: stripeSub })
            results.push(`✅ Customer ${customerId}: recovered orphan subscription for user ${userId}`)
          } catch (err) {
            errors++
            const msg = err instanceof Error ? err.message : 'Unknown error'
            results.push(`❌ Customer ${customerId}: error recovering orphan — ${msg}`)
          }
        } else if (appwriteSub.status !== stripeSub.status) {
          // Status mismatch — repair.
          try {
            await syncSubscriptionToAppwrite({
              userId: appwriteSub.userId,
              customerId,
              subscription: stripeSub,
            })
            results.push(
              `✅ User ${appwriteSub.userId}: status ${appwriteSub.status} → ${stripeSub.status}`,
            )
            logSubscriptionEvent({
              userId: appwriteSub.userId,
              eventType: 'reconciliation_fix',
              stripeEventId: `reconcile_${stripeSub.id}`,
              subscriptionId: stripeSub.id,
              customerId,
              previousStatus: appwriteSub.status,
              newStatus: stripeSub.status,
              plan: detectPlanFromSubscription(stripeSub),
              timestamp: Date.now(),
            }).catch(() => {})
          } catch (err) {
            errors++
            const msg = err instanceof Error ? err.message : 'Unknown error'
            results.push(`❌ User ${appwriteSub.userId}: error fixing mismatch — ${msg}`)
          }
        }
      }

      startingAfter = stripeSubs.has_more
        ? stripeSubs.data[stripeSubs.data.length - 1].id
        : undefined
    } while (startingAfter)

    return {
      reconciled: results.filter((r) => r.startsWith('✅')).length,
      errors,
      results,
    }
  },

  /**
   * Open a managed billing surface (logic from `/api/stripe/portal`). The
   * customer id is always derived from the user's own stored subscription, never
   * trusted from input. Tries the payment-method-update flow first and falls back
   * to the generic portal when that flow isn't configured in the Stripe Dashboard.
   */
  async getManageUrl(params: {
    userId: string
    jwt?: string
    appUrl: string
  }): Promise<{ url: string }> {
    const { getSubscription } = await import('@/lib/appwrite-server')
    const subscription = await getSubscription(params.userId, params.jwt)
    const customerId = stripeCustomerIdOf(subscription)
    if (!subscription || !customerId) {
      throw new Error(NOT_SUBSCRIBED)
    }

    let session: Stripe.BillingPortal.Session
    try {
      session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${params.appUrl}?billing=updated`,
        flow_data: { type: 'payment_method_update' },
      })
    } catch (err) {
      if ((err as { code?: string })?.code === 'billing_portal_configuration_incomplete') {
        session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${params.appUrl}?billing=updated`,
        })
      } else {
        throw err
      }
    }

    if (!session.url) {
      throw new Error('Stripe did not return a billing portal URL')
    }
    return { url: session.url }
  },
}
