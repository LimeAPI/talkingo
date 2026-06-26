/**
 * The `PaymentProvider` abstraction — the heart of the unified payment layer.
 *
 * One interface, two implementations (`StripeProvider`, `DodoProvider`), resolved
 * through a single `getProvider(id)` registry. Application routes never call the
 * Stripe or Dodo SDK directly; they resolve a `PaymentProvider` and call these
 * interface methods. SDK calls live only inside the provider implementations.
 *
 * This is what removes the legacy `/api/stripe/*` (Stripe-only) vs `/api/billing/*`
 * (Dodo-only) split and lets both providers behave identically from the
 * application's point of view.
 *
 * _Requirements: 1.1, 1.5, 1.6_
 */

/** A known payment provider identifier. */
export type ProviderId = 'stripe' | 'dodopayments'

/** A plan a user can subscribe to. */
export type PlanId = 'trial' | 'monthly' | 'yearly'

/** Provider-agnostic subscription status. Unknown values normalize to `incomplete`. */
export type UnifiedStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'incomplete'
  | 'unpaid'

/** Provider-agnostic snapshot persisted to Appwrite and returned to the client. */
export interface UnifiedSubscription {
  provider: ProviderId
  providerCustomerId: string
  providerSubscriptionId?: string
  status: UnifiedStatus
  plan: 'monthly' | 'yearly'
  /** epoch ms */
  trialEnd?: number
  /** epoch ms */
  periodEnd?: number
  cancelAtPeriodEnd: boolean
  /** epoch ms — used for conditional/race-safe writes */
  updatedAt: number
}

/** Parameters for creating a hosted checkout session/link. */
export interface CheckoutParams {
  userId: string
  plan: PlanId
  /** 'card' | 'upi' | ... (hint to provider) */
  method?: string
  email?: string
  idempotencyKey: string
  appUrl: string
}

/** Result of creating a hosted checkout. */
export interface CheckoutResult {
  url: string
  providerCustomerId: string
}

/**
 * Provider-agnostic invoice/payment record returned by the billing-history
 * route. Mapped from each provider's native invoice/payment shape so the client
 * renders one uniform list regardless of which provider powers the subscription.
 */
export interface UnifiedInvoice {
  /** Stable provider invoice/payment id (used as a list key). */
  id: string
  /** epoch ms — issue/creation time, used to order the list descending. */
  date: number
  /** Amount in the currency's major unit (e.g. dollars, not cents). */
  amount: number
  /** ISO 4217 currency code, lower/upper-case as the provider reports it. */
  currency: string
  /** Provider-native invoice/payment status (e.g. 'paid', 'succeeded', 'open'). */
  status: string
  /** Which provider issued the invoice. */
  provider: ProviderId
  /** Optional hosted receipt / invoice URL when the provider exposes one. */
  receiptUrl?: string
}

/** A provider webhook event normalized into a provider-agnostic shape. */
export interface NormalizedEvent {
  /** namespaced: `${provider}:${rawId}` */
  id: string
  /** provider-agnostic event name */
  type: string
  userId?: string
  customerId?: string
  subscription?: UnifiedSubscription
}

/**
 * Every provider implements exactly this surface. Routes call only this.
 *
 * The interface exposes exactly 10 operations: `isEnabled`, `createCheckout`,
 * `syncFromCheckout`, `getStatus`, `cancel`, `reactivate`, `changePlan`,
 * `verifyWebhook`, `reconcile`, and `getManageUrl`.
 */
export interface PaymentProvider {
  readonly id: ProviderId

  /** Is this provider configured (keys + products present)? */
  isEnabled(): boolean

  /** Create a hosted checkout session/link for the chosen plan. */
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>

  /** Pull live state for a returned checkout and persist it (idempotent). */
  syncFromCheckout(params: {
    userId: string
    sessionId: string
  }): Promise<UnifiedSubscription | null>

  /**
   * Reconcile-on-checkout (optional). If the user's existing provider customer
   * already has a LIVE subscription (active / trialing / past_due) at the
   * provider, persist that authoritative state via `syncToAppwrite` and return
   * it — so the checkout route can recover a missed activation and block a
   * duplicate charge instead of creating a second subscription. Returns `null`
   * when there is no reusable customer or no live subscription. Implementations
   * MUST treat the "nothing to adopt" case as a non-error (never throw) so a
   * reconcile hiccup can never block a legitimate first-time checkout.
   */
  adoptExistingSubscription?(params: {
    userId: string
    jwt?: string
  }): Promise<UnifiedSubscription | null>

  /** Authoritative current state for a user (reads provider if needed). */
  getStatus(params: { userId: string; jwt?: string }): Promise<UnifiedSubscription | null>

  /** Schedule cancellation at period end. */
  cancel(params: { userId: string; jwt?: string }): Promise<UnifiedSubscription>

  /** Undo a scheduled cancellation. */
  reactivate(params: { userId: string; jwt?: string }): Promise<UnifiedSubscription>

  /** Switch monthly <-> yearly with immediate proration. */
  changePlan(params: {
    userId: string
    jwt?: string
    plan: 'monthly' | 'yearly'
  }): Promise<UnifiedSubscription>

  /** Verify a webhook signature and normalize the event. Throws on bad signature. */
  verifyWebhook(
    rawBody: string,
    signature: string | null,
    headers: Headers,
  ): Promise<NormalizedEvent>

  /** Compare live provider state vs Appwrite and fix drift. Admin/cron only. */
  reconcile(): Promise<{ reconciled: number; errors: number; results: string[] }>

  /** Open a managed billing/payment-method update surface (portal or link). */
  getManageUrl(params: {
    userId: string
    jwt?: string
    appUrl: string
  }): Promise<{ url: string }>
}
