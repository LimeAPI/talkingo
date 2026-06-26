/**
 * DodoProvider — adapter that implements the `PaymentProvider` interface over
 * the existing DodoPayments integration (brownfield: reuse, don't rewrite).
 *
 * This is a thin adapter. The SDK calls and persistence logic it performs are
 * the same ones that previously lived inline in the Dodo-hardcoded
 * `/api/billing/*` routes (`cancel`, `change-plan`, `reactivate`,
 * `dodo-reconcile`) and the `/api/webhook/dodo-payments` handler — now wrapped
 * behind the provider-agnostic interface so routes never touch the Dodo SDK
 * directly. Every subscription-returning method returns a `UnifiedSubscription`
 * and persists through the shared, race-safe `syncToAppwrite` writer.
 *
 * _Requirements: 1.3, 1.6, 5.11, 8.8, 11.1, 11.6, 10.4_
 */

import 'server-only'
import { Webhook } from 'standardwebhooks'
import { dodo } from '../dodopayments/client'
import { DODOPAYMENTS_ENV, DODOPAYMENTS_PRODUCTS, getDodoBrandId } from '../dodopayments/env'
import {
  buildUnifiedFromDodoSubscription,
  deriveDodoWebhookEventId,
  syncFromDodoCheckout,
} from '../dodopayments/sync'
import { getSubscription, type SubscriptionDoc } from '@/lib/appwrite-server'
import { syncToAppwrite } from './sync'
import { toUnified } from './subscription-mapper'
import type {
  CheckoutParams,
  CheckoutResult,
  NormalizedEvent,
  PaymentProvider,
  ProviderId,
  UnifiedSubscription,
} from './provider'

/** Resolve the live Dodo subscription id from a stored document.
 *
 * Provider-scoped: only ever returns a DodoPayments subscription id. We read the
 * Dodo-specific legacy field first, then the canonical field ONLY when the row's
 * provider is actually `dodopayments`. We must NOT fall back to the bare
 * canonical `providerSubscriptionId`, because for a row whose active provider is
 * Stripe that canonical id is a Stripe id — handing it to the Dodo API 404s.
 */
function subscriptionIdOf(doc: SubscriptionDoc | null): string | undefined {
  if (!doc) return undefined
  return (
    doc.dodopaymentsSubscriptionId ??
    (doc.provider === 'dodopayments' ? doc.providerSubscriptionId : undefined)
  )
}

/** Resolve the Dodo customer id from a stored document.
 *
 * Provider-scoped for the same reason as `subscriptionIdOf`: never return a
 * Stripe customer id to the Dodo SDK. Prefer the Dodo-specific legacy field,
 * then the canonical field only when the row's provider is `dodopayments`.
 */
function customerIdOf(doc: SubscriptionDoc | null): string | undefined {
  if (!doc) return undefined
  return (
    doc.dodopaymentsCustomerId ??
    (doc.provider === 'dodopayments' ? doc.providerCustomerId : undefined)
  )
}

/** Map a checkout `PlanId` to the configured Dodo product id (trial bills as monthly). */
function productIdForPlan(plan: CheckoutParams['plan']): string {
  return plan === 'yearly' ? DODOPAYMENTS_PRODUCTS.yearly : DODOPAYMENTS_PRODUCTS.monthly
}

export const dodoProvider: PaymentProvider = {
  id: 'dodopayments' as ProviderId,

  /**
   * DodoPayments is enabled only when all required credentials are present and
   * non-empty. Enablement is resolved exclusively through the `DODOPAYMENTS_ENV`
   * proxy, which aliases both the `DODOPAYMENTS_*` and `DODO_PAYMENTS_*`
   * spellings (notably `DODOPAYMENTS_API_KEY` / `DODO_PAYMENTS_API_KEY`). The
   * proxy validates every required var on first access and throws if any is
   * missing or a placeholder, so a thrown error means the provider is not fully
   * configured → disabled. Because resolution flows through the shared proxy,
   * either spelling produces an identical enablement result.
   */
  isEnabled(): boolean {
    try {
      return Boolean(
        DODOPAYMENTS_ENV.DODOPAYMENTS_API_KEY &&
          DODOPAYMENTS_ENV.DODOPAYMENTS_WEBHOOK_SECRET &&
          DODOPAYMENTS_ENV.DODOPAYMENTS_PRODUCT_MONTHLY &&
          DODOPAYMENTS_ENV.DODOPAYMENTS_PRODUCT_YEARLY,
      )
    } catch {
      return false
    }
  },

  /**
   * Create a hosted DodoPayments checkout (subscription payment-link flow).
   *
   * Per Requirement 5.11 the provider pre-creates the Dodo customer and upserts
   * the subscription as `incomplete` BEFORE returning the URL, so the webhook
   * can resolve the user from the customer id and a returning user is never
   * stranded without local state.
   */
  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { userId, plan, email, idempotencyKey, appUrl } = params

    const productId = productIdForPlan(plan)
    if (!productId) {
      throw new Error('Target Dodo plan is not configured')
    }
    const storedPlan: 'monthly' | 'yearly' = plan === 'yearly' ? 'yearly' : 'monthly'

    // Reuse an existing Dodo customer when we already have one for this user.
    const existing = await getSubscription(userId).catch(() => null)
    let customerId = customerIdOf(existing)

    // Self-heal a stale/foreign customer id. Rows written by older code could
    // store a Stripe customer id in the Dodo field — Dodo then 404s ("Customer
    // does not exist"). Verify the stored id actually exists at Dodo; if not,
    // discard it and create a fresh Dodo customer instead of failing checkout.
    if (customerId) {
      try {
        await dodo.customers.retrieve(customerId)
      } catch {
        customerId = undefined
      }
    }

    if (!customerId) {
      if (!email) {
        // A new Dodo customer cannot be created without an email address.
        throw new Error('email_required')
      }
      const customer: any = await dodo.customers.create({
        email,
        name: email,
        metadata: { userId },
      })
      customerId = String(customer?.customer_id ?? customer?.id ?? '')
      if (!customerId) {
        throw new Error('Failed to create Dodo customer')
      }
    }

    // 5.11: persist the pre-checkout `incomplete` state before redirecting.
    await syncToAppwrite(userId, {
      provider: 'dodopayments',
      providerCustomerId: customerId,
      status: 'incomplete',
      plan: storedPlan,
      cancelAtPeriodEnd: false,
      updatedAt: Date.now(),
    })

    // Canonical return surface read by CheckoutReturnHandler
    // (`?provider=&status=success&session_id=`). Dodo automatically appends its
    // own `subscription_id=` (and a `status=`) to this URL on completion; the
    // handler maps that appended `subscription_id` to the sessionId that
    // `syncFromDodoCheckout` expects (the Dodo subscription id is the session id).
    const returnUrl = `${appUrl}?provider=dodopayments&status=success`
    // Brand id (optional) brands the hosted checkout with our logo. Left off the
    // payload entirely when unset so Dodo uses the merchant default brand. We do
    // NOT pass `allowed_payment_method_types`, so the checkout offers EVERY
    // payment method enabled for the brand and available in the customer's
    // region (UPI, cards, wallets, net banking, local methods, etc.).
    const brandId = getDodoBrandId()
    const res: any = await dodo.subscriptions.create(
      {
        customer: { customer_id: customerId },
        product_id: productId,
        quantity: 1,
        payment_link: true,
        return_url: returnUrl,
        ...(brandId ? { brand_id: brandId } : {}),
        // Hosted payment link collects the real billing address; this is a
        // sensible default so the SDK's required `billing.country` is satisfied.
        billing: { country: (params as any).country ?? 'US' },
        metadata: { userId, plan: storedPlan },
      } as any,
      { headers: { 'Idempotency-Key': idempotencyKey } } as any,
    )

    const url = res?.payment_link ?? res?.payment_link_url ?? res?.url
    if (!url) {
      throw new Error('Dodo did not return a checkout URL')
    }

    return { url: String(url), providerCustomerId: customerId }
  },

  /** Pull live state for a returned Dodo checkout and persist it (idempotent). */
  syncFromCheckout(params: {
    userId: string
    sessionId: string
  }): Promise<UnifiedSubscription | null> {
    return syncFromDodoCheckout(params)
  },

  /**
   * Reconcile-on-checkout. If this user's Dodo customer already has a live
   * (active / on_hold) subscription, persist it and return it so the checkout
   * route can recover a missed activation and block a duplicate charge. Never
   * throws — any lookup failure resolves to `null` so a legitimate first-time
   * checkout is never blocked.
   */
  async adoptExistingSubscription(params: {
    userId: string
    jwt?: string
  }): Promise<UnifiedSubscription | null> {
    const { userId, jwt } = params
    try {
      const sub = await getSubscription(userId, jwt).catch(() => null)
      const customerId = customerIdOf(sub)
      if (!customerId) return null

      // Dodo "active"/"on_hold" are the access-granting / recoverable states.
      const list: any = await dodo.subscriptions.list({ customer_id: customerId } as any)
      const items: any[] = list?.items ?? list?.data ?? []
      const live = items.find((s) => ['active', 'on_hold'].includes(String(s?.status)))
      if (!live) return null

      const unified = buildUnifiedFromDodoSubscription(live, {
        customerId,
        updatedAt: Date.now(),
      })
      if (!unified.providerCustomerId || !unified.providerSubscriptionId) return null

      await syncToAppwrite(userId, unified)
      return unified
    } catch {
      // Best-effort: never block a checkout because reconcile couldn't run.
      return null
    }
  },

  /**
   * Authoritative current state for a user. Reads the stored document, and when
   * a live Dodo subscription id is present refreshes from Dodo and re-persists,
   * falling back to the stored snapshot if the provider is unreachable.
   */
  async getStatus(params: {
    userId: string
    jwt?: string
  }): Promise<UnifiedSubscription | null> {
    const { userId, jwt } = params
    const sub = await getSubscription(userId, jwt)
    if (!sub) return null

    const stored = toUnified(sub)
    if (!stored) return null

    if (stored.provider === 'dodopayments' && stored.providerSubscriptionId) {
      try {
        const live: any = await dodo.subscriptions.retrieve(stored.providerSubscriptionId)
        const fresh = buildUnifiedFromDodoSubscription(live, {
          customerId: stored.providerCustomerId,
          plan: stored.plan,
          updatedAt: Date.now(),
        })
        if (fresh.providerCustomerId) {
          await syncToAppwrite(userId, fresh)
          return fresh
        }
      } catch {
        // Provider unreachable — fall back to the last known stored state.
      }
    }

    return stored
  },

  /**
   * Schedule cancellation at the next billing date (Dodo's equivalent of
   * Stripe's `cancel_at_period_end`). Status stays `active` (Requirement 11.1).
   */
  async cancel(params: { userId: string; jwt?: string }): Promise<UnifiedSubscription> {
    const { userId, jwt } = params
    const sub = await getSubscription(userId, jwt)
    const subId = subscriptionIdOf(sub)
    if (!sub || !subId) {
      throw new Error('no_subscription')
    }

    await dodo.subscriptions.update(subId, { cancel_at_next_billing_date: true } as any)
    const live: any = await dodo.subscriptions.retrieve(subId)

    const unified = buildUnifiedFromDodoSubscription(live, {
      customerId: customerIdOf(sub),
      plan: (sub.plan as 'monthly' | 'yearly') || 'monthly',
      cancelAtPeriodEnd: true,
      updatedAt: Date.now(),
    })

    await syncToAppwrite(userId, unified)
    return unified
  },

  /** Undo a scheduled cancellation by clearing `cancel_at_next_billing_date` (Requirement 11.6). */
  async reactivate(params: { userId: string; jwt?: string }): Promise<UnifiedSubscription> {
    const { userId, jwt } = params
    const sub = await getSubscription(userId, jwt)
    const subId = subscriptionIdOf(sub)
    if (!sub || !subId) {
      throw new Error('no_subscription')
    }

    await dodo.subscriptions.update(subId, { cancel_at_next_billing_date: false } as any)
    const live: any = await dodo.subscriptions.retrieve(subId)

    const unified = buildUnifiedFromDodoSubscription(live, {
      customerId: customerIdOf(sub),
      plan: (sub.plan as 'monthly' | 'yearly') || 'monthly',
      cancelAtPeriodEnd: false,
      updatedAt: Date.now(),
    })

    await syncToAppwrite(userId, unified)
    return unified
  },

  /** Switch monthly <-> yearly with immediate proration, then re-read authoritative state (Requirement 10.4). */
  async changePlan(params: {
    userId: string
    jwt?: string
    plan: 'monthly' | 'yearly'
  }): Promise<UnifiedSubscription> {
    const { userId, jwt, plan } = params
    const sub = await getSubscription(userId, jwt)
    const subId = subscriptionIdOf(sub)
    if (!sub || !subId) {
      throw new Error('no_subscription')
    }

    const productId = productIdForPlan(plan)
    if (!productId) {
      throw new Error('plan_unconfigured')
    }

    await dodo.subscriptions.changePlan(subId, {
      product_id: productId,
      proration_billing_mode: 'prorated_immediately',
    } as any)

    // 10.4: read the authoritative state through a dedicated retrieve.
    const live: any = await dodo.subscriptions.retrieve(subId)
    const unified = buildUnifiedFromDodoSubscription(live, {
      customerId: customerIdOf(sub),
      plan,
      updatedAt: Date.now(),
    })

    await syncToAppwrite(userId, unified)
    return unified
  },

  /**
   * Verify a Dodo webhook signature over the raw body and normalize the event.
   *
   * Requirement 8.8: the event id is derived from a STABLE composite
   * (`subscriptionId + type + periodEnd`) and namespaced as
   * `dodopayments:{rawId}`, so retries of the same event de-duplicate (no more
   * random-id fallback). Throws on a missing secret or an invalid signature so
   * the webhook handler returns a 400 and never mutates state.
   */
  async verifyWebhook(
    rawBody: string,
    signature: string | null,
    headers: Headers,
  ): Promise<NormalizedEvent> {
    // Accessing the proxy throws if the secret (or any required var) is missing.
    const secret = DODOPAYMENTS_ENV.DODOPAYMENTS_WEBHOOK_SECRET

    const wh = new Webhook(secret)
    const webhookHeaders = {
      'webhook-id': headers.get('webhook-id') ?? '',
      'webhook-timestamp': headers.get('webhook-timestamp') ?? '',
      'webhook-signature': headers.get('webhook-signature') ?? signature ?? '',
    }

    // Throws `WebhookVerificationError` on a bad signature — propagated to the caller.
    const payload = wh.verify(rawBody, webhookHeaders) as any

    const data = payload?.data ?? payload ?? {}
    const type = String(payload?.type ?? data?.type ?? 'unknown')
    const subscriptionId = String(
      data?.subscription_id ?? data?.subscriptionId ?? data?.id ?? '',
    )
    const customerId =
      data?.customer?.customer_id ?? data?.customer_id ?? data?.customerId ?? undefined
    const userId = data?.metadata?.userId ?? payload?.metadata?.userId ?? undefined
    const periodEnd = data?.next_billing_date ?? data?.current_period_end ?? data?.period_end

    // Stable, provider-namespaced id (Requirement 8.8 + design "Idempotency key
    // namespacing"). Derived via the shared pure helper so retries de-dupe and
    // the test exercises the real logic.
    const id = deriveDodoWebhookEventId(subscriptionId, type, periodEnd)

    let subscription: UnifiedSubscription | undefined
    if (subscriptionId && data?.status != null) {
      subscription = buildUnifiedFromDodoSubscription(data, {
        customerId,
        updatedAt: Date.now(),
      })
    }

    return {
      id,
      type,
      userId: userId ? String(userId) : undefined,
      customerId: customerId ? String(customerId) : undefined,
      subscription,
    }
  },

  /**
   * Compare every stored Dodo subscription against live Dodo state and fix
   * drift; subscriptions deleted at the provider are marked `expired`. Wraps the
   * logic previously inline in `/api/billing/dodo-reconcile`. Admin/cron only.
   */
  async reconcile(): Promise<{ reconciled: number; errors: number; results: string[] }> {
    const { getAdminDatabases } = await import('@/lib/appwrite-server')
    const { APPWRITE_DB_ID, COLLECTION_IDS } = await import('@/lib/appwrite-schema')
    const { Query } = await import('node-appwrite')

    const db = getAdminDatabases()
    const results: string[] = []
    let reconciled = 0
    let errors = 0

    const appwriteSubs = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
      Query.isNotNull('dodopaymentsCustomerId'),
      Query.limit(500),
    ])

    for (const docRaw of appwriteSubs.documents) {
      const doc = docRaw as any
      const customerId: string | undefined = doc.dodopaymentsCustomerId ?? doc.providerCustomerId
      const subId: string | undefined = doc.dodopaymentsSubscriptionId ?? doc.providerSubscriptionId

      if (!customerId || !subId) {
        results.push(`⚠️ User ${doc.userId}: dodopaymentsCustomerId/subId missing`)
        continue
      }

      try {
        const live: any = await dodo.subscriptions.retrieve(subId)
        const unified = buildUnifiedFromDodoSubscription(live, {
          customerId,
          plan: (doc.plan as 'monthly' | 'yearly') || 'monthly',
          updatedAt: Date.now(),
        })

        const drifted =
          doc.status !== unified.status ||
          doc.plan !== unified.plan ||
          (unified.periodEnd != null && doc.periodEnd !== unified.periodEnd) ||
          (doc.cancelAtPeriodEnd ?? false) !== unified.cancelAtPeriodEnd

        if (drifted) {
          await syncToAppwrite(doc.userId, unified)
          reconciled++
          results.push(
            `✅ User ${doc.userId}: ${doc.status}→${unified.status}, ${doc.plan}→${unified.plan}`,
          )
        } else {
          results.push(`• User ${doc.userId}: unchanged`)
        }
      } catch (err: any) {
        if (err?.status === 404 || err?.code === 'resource_missing' || err?.code === 404) {
          // Subscription deleted at Dodo → expire it locally (Requirement 9.6).
          await syncToAppwrite(doc.userId, {
            provider: 'dodopayments',
            providerCustomerId: customerId,
            providerSubscriptionId: subId,
            status: 'expired',
            plan: (doc.plan as 'monthly' | 'yearly') || 'monthly',
            cancelAtPeriodEnd: false,
            updatedAt: Date.now(),
          })
          reconciled++
          results.push(`✅ User ${doc.userId}: Dodo sub missing → marked expired`)
        } else {
          errors++
          results.push(`❌ User ${doc.userId}: ${err?.message || 'unknown error'}`)
        }
      }
    }

    return { reconciled, errors, results }
  },

  /**
   * Open a managed billing surface. Dodo provides a hosted customer portal
   * (payment-method updates, invoices), so we mint a portal session for the
   * user's customer id.
   */
  async getManageUrl(params: {
    userId: string
    jwt?: string
    appUrl: string
  }): Promise<{ url: string }> {
    const { userId, jwt, appUrl } = params
    const sub = await getSubscription(userId, jwt)
    const customerId = customerIdOf(sub)
    if (!customerId) {
      throw new Error('no_subscription')
    }

    const session: any = await dodo.customers.customerPortal.create(customerId, {
      return_url: appUrl,
    } as any)

    const url = session?.link ?? session?.url
    if (!url) {
      throw new Error('Dodo did not return a portal URL')
    }
    return { url: String(url) }
  },
}
