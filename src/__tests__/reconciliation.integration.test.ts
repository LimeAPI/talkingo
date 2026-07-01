/**
 * Integration tests — scheduled reconciliation
 *
 * Feature: unified-payment-experience, Task 17.2
 * _Requirements: 9.4, 9.5, 9.6, 9.7_
 *
 * These tests drive the real reconciliation logic against mocked boundaries
 * (Dodo/Stripe SDKs, the shared `syncToAppwrite` writer, the Appwrite admin
 * datastore, and the schema/Query helpers) so the comparison + outcome logic is
 * exercised end-to-end without any network or live store.
 *
 * Coverage:
 *  - STATUS MISMATCH (9.4): a stored doc whose status differs from the live
 *    provider value is updated via `syncToAppwrite` and counted as reconciled
 *    (driven through the simpler `dodoProvider.reconcile()`, which iterates the
 *    stored docs and compares each against live Dodo state).
 *  - DELETED-AT-PROVIDER (9.6): when `dodo.subscriptions.retrieve` 404s, the
 *    stored doc is expired via `syncToAppwrite` and counted.
 *  - ORPHAN / CREATE (9.5): a subscription that exists at the provider but has
 *    no matching local doc. Orphan recovery is a *Stripe-reconcile* behaviour
 *    (it resolves the owner by email), since the Dodo reconcile only iterates
 *    existing Appwrite docs. We cover the create path through
 *    `stripeProvider.reconcile()` by seeding a live Stripe subscription with no
 *    matching Appwrite doc and a resolvable email.
 *  - AGGREGATED REPORT (9.7): the `/api/billing/reconcile` route mocks the
 *    registry so each provider returns a canned report, then asserts the totals
 *    sum, the per-provider entries are present, a failing provider is counted
 *    (continuing past it), and an admin token is required (401 without one).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Hoisted mock fns referenced inside vi.mock factories ────────────────────
const h = vi.hoisted(() => ({
  // SDK boundaries
  dodoRetrieve: vi.fn(),
  stripeSubsList: vi.fn(),
  stripeCustomersRetrieve: vi.fn(),
  // Appwrite admin boundary
  listDocuments: vi.fn(),
  usersList: vi.fn(),
  logSubscriptionEvent: vi.fn(),
  // shared writers
  syncToAppwrite: vi.fn(),
  syncSubscriptionToAppwrite: vi.fn(),
  detectPlanFromSubscription: vi.fn(() => 'monthly'),
  // registry (route test)
  enabledProviders: vi.fn(),
  getProvider: vi.fn(),
}))

// ─── Dodo boundary ───────────────────────────────────────────────────────────
vi.mock('@/lib/dodopayments/env', () => ({
  DODOPAYMENTS_ENV: {
    DODOPAYMENTS_API_KEY: 'test_api_key',
    DODOPAYMENTS_WEBHOOK_SECRET: 'test_webhook_secret',
    DODOPAYMENTS_PRODUCT_MONTHLY: 'prod_monthly',
    DODOPAYMENTS_PRODUCT_YEARLY: 'prod_yearly',
  },
  DODOPAYMENTS_PRODUCTS: { monthly: 'prod_monthly', yearly: 'prod_yearly' },
}))

vi.mock('@/lib/dodopayments/client', () => ({
  dodo: {
    subscriptions: { retrieve: (...a: unknown[]) => h.dodoRetrieve(...a) },
  },
}))

// ─── Stripe boundary ───────────────────────────────────────────────────────────
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: { list: (...a: unknown[]) => h.stripeSubsList(...a) },
    customers: { retrieve: (...a: unknown[]) => h.stripeCustomersRetrieve(...a) },
  },
}))

vi.mock('@/lib/stripe/env', () => ({
  STRIPE_ENV: {
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_TRIAL: 'price_trial',
    STRIPE_PRICE_MONTHLY: 'price_monthly',
    STRIPE_PRICE_YEARLY: 'price_yearly',
  },
  STRIPE_PRICES: { trial: 'price_trial', monthly: 'price_monthly', yearly: 'price_yearly' },
}))

vi.mock('@/lib/stripe/plans', () => ({
  PLANS: {
    trial: { id: 'trial', recurringPriceId: 'price_monthly', oneTimePriceId: 'price_trial', trialDays: 5 },
    monthly: { id: 'monthly', recurringPriceId: 'price_monthly' },
    yearly: { id: 'yearly', recurringPriceId: 'price_yearly' },
  },
}))

vi.mock('@/lib/stripe/sync', () => ({
  syncSubscriptionToAppwrite: (...a: unknown[]) => h.syncSubscriptionToAppwrite(...a),
  detectPlanFromSubscription: (...a: unknown[]) => (h.detectPlanFromSubscription as (...args: unknown[]) => unknown)(...a),
  syncFromCheckoutSession: vi.fn(),
}))

// ─── Shared race-safe writer ─────────────────────────────────────────────────
vi.mock('@/lib/payments/sync', () => ({
  syncToAppwrite: (...a: unknown[]) => h.syncToAppwrite(...a),
}))

// ─── Appwrite admin datastore ────────────────────────────────────────────────
vi.mock('@/lib/appwrite-server', () => ({
  getAdminDatabases: () => ({ listDocuments: (...a: unknown[]) => h.listDocuments(...a) }),
  getAdminUsers: () => ({ list: (...a: unknown[]) => h.usersList(...a) }),
  logSubscriptionEvent: (...a: unknown[]) => h.logSubscriptionEvent(...a),
  getSubscription: vi.fn(),
  getSubscriptionByCustomerId: vi.fn(),
  upsertSubscription: vi.fn(),
  updateUserPrefs: vi.fn(),
}))

vi.mock('node-appwrite', () => ({
  Query: {
    isNotNull: (f: string) => `isNotNull(${f})`,
    limit: (n: number) => `limit(${n})`,
    equal: (f: string, v: unknown) => `equal(${f},${String(v)})`,
  },
}))

// ─── Registry (only consumed by the route) ───────────────────────────────────
vi.mock('@/lib/payments/registry', () => ({
  enabledProviders: (...a: unknown[]) => h.enabledProviders(...a),
  getProvider: (...a: unknown[]) => h.getProvider(...a),
}))

// Real units under test (loaded AFTER the mocks above).
import { dodoProvider } from '@/lib/payments/dodo-provider'
import { stripeProvider } from '@/lib/payments/stripe-provider'
import { POST as reconcileRoute } from '@/app/api/billing/reconcile/route'

beforeEach(() => {
  vi.clearAllMocks()
  h.detectPlanFromSubscription.mockReturnValue('monthly')
})

// A far-future epoch-ms timestamp reused across docs so period-end never drifts
// unless we want it to.
const PERIOD_END = 1893456000000 // 2030-01-01T00:00:00Z

// ─── DODO: status mismatch (9.4) + deleted-at-provider (9.6) + counts (9.7) ──

describe('dodoProvider.reconcile — drift, expiry, and aggregated counts', () => {
  it('updates a status mismatch, expires a deleted-at-provider sub, leaves unchanged ones, and counts correctly', async () => {
    const docs = [
      // (a) STATUS MISMATCH: stored active, live cancelled → must be updated.
      {
        userId: 'u_drift',
        dodopaymentsCustomerId: 'cus_drift',
        dodopaymentsSubscriptionId: 'sub_drift',
        status: 'active',
        plan: 'monthly',
        periodEnd: PERIOD_END,
        cancelAtPeriodEnd: false,
      },
      // (b) DELETED AT PROVIDER: retrieve 404s → must be expired.
      {
        userId: 'u_gone',
        dodopaymentsCustomerId: 'cus_gone',
        dodopaymentsSubscriptionId: 'sub_gone',
        status: 'active',
        plan: 'monthly',
        periodEnd: PERIOD_END,
        cancelAtPeriodEnd: false,
      },
      // (c) UNCHANGED: stored matches live exactly → no write, not counted.
      {
        userId: 'u_same',
        dodopaymentsCustomerId: 'cus_same',
        dodopaymentsSubscriptionId: 'sub_same',
        status: 'active',
        plan: 'monthly',
        periodEnd: PERIOD_END,
        cancelAtPeriodEnd: false,
      },
    ]
    h.listDocuments.mockResolvedValue({ documents: docs })

    h.dodoRetrieve.mockImplementation(async (subId: string) => {
      if (subId === 'sub_drift') {
        return {
          subscription_id: 'sub_drift',
          status: 'cancelled',
          customer: { customer_id: 'cus_drift' },
          next_billing_date: PERIOD_END,
        }
      }
      if (subId === 'sub_gone') {
        const err: any = new Error('Not found')
        err.status = 404
        throw err
      }
      if (subId === 'sub_same') {
        return {
          subscription_id: 'sub_same',
          status: 'active',
          customer: { customer_id: 'cus_same' },
          next_billing_date: PERIOD_END,
        }
      }
      throw new Error(`unexpected subId ${subId}`)
    })

    const report = await dodoProvider.reconcile()

    // Aggregated counts (9.7): drift + expiry reconciled, unchanged not counted.
    expect(report.reconciled).toBe(2)
    expect(report.errors).toBe(0)
    expect(report.results).toHaveLength(3)

    // (a) drift → updated to the live status (9.4).
    expect(h.syncToAppwrite).toHaveBeenCalledWith(
      'u_drift',
      expect.objectContaining({ provider: 'dodopayments', status: 'canceled' }),
    )
    // (b) deleted-at-provider → expired (9.6).
    expect(h.syncToAppwrite).toHaveBeenCalledWith(
      'u_gone',
      expect.objectContaining({
        provider: 'dodopayments',
        status: 'expired',
        providerSubscriptionId: 'sub_gone',
      }),
    )
    // (c) unchanged → never written.
    expect(h.syncToAppwrite).toHaveBeenCalledTimes(2)
    expect(h.syncToAppwrite).not.toHaveBeenCalledWith('u_same', expect.anything())
  })

  it('maps an on_hold live status to past_due and counts it as an update (9.4)', async () => {
    h.listDocuments.mockResolvedValue({
      documents: [
        {
          userId: 'u_hold',
          dodopaymentsCustomerId: 'cus_hold',
          dodopaymentsSubscriptionId: 'sub_hold',
          status: 'active',
          plan: 'monthly',
          periodEnd: PERIOD_END,
          cancelAtPeriodEnd: false,
        },
      ],
    })
    h.dodoRetrieve.mockResolvedValue({
      subscription_id: 'sub_hold',
      status: 'on_hold',
      customer: { customer_id: 'cus_hold' },
      next_billing_date: PERIOD_END,
    })

    const report = await dodoProvider.reconcile()

    expect(report.reconciled).toBe(1)
    expect(report.errors).toBe(0)
    expect(h.syncToAppwrite).toHaveBeenCalledWith(
      'u_hold',
      expect.objectContaining({ status: 'past_due' }),
    )
  })

  it('counts a non-404 retrieve failure as an error without expiring the sub (9.7)', async () => {
    h.listDocuments.mockResolvedValue({
      documents: [
        {
          userId: 'u_err',
          dodopaymentsCustomerId: 'cus_err',
          dodopaymentsSubscriptionId: 'sub_err',
          status: 'active',
          plan: 'monthly',
          periodEnd: PERIOD_END,
          cancelAtPeriodEnd: false,
        },
      ],
    })
    h.dodoRetrieve.mockRejectedValue(new Error('Dodo 500 boom'))

    const report = await dodoProvider.reconcile()

    expect(report.reconciled).toBe(0)
    expect(report.errors).toBe(1)
    expect(h.syncToAppwrite).not.toHaveBeenCalled()
  })
})

// ─── STRIPE: orphan recovery / create path (9.5) ─────────────────────────────

describe('stripeProvider.reconcile — orphan recovery (create path)', () => {
  it('creates the missing local subscription for a live Stripe sub resolvable by email (9.5)', async () => {
    // One active Stripe subscription, no more pages.
    h.stripeSubsList.mockResolvedValue({
      data: [{ id: 'sub_orphan', status: 'active', customer: 'cus_orphan' }],
      has_more: false,
    })
    // No matching Appwrite doc → orphan.
    h.listDocuments.mockResolvedValue({ documents: [] })
    // Customer has a resolvable email.
    h.stripeCustomersRetrieve.mockResolvedValue({ deleted: false, email: 'orphan@test.com' })
    // Email resolves to an Appwrite user.
    h.usersList.mockResolvedValue({ users: [{ $id: 'user_orphan' }] })

    const report = await stripeProvider.reconcile()

    expect(report.reconciled).toBe(1)
    expect(report.errors).toBe(0)
    expect(h.syncSubscriptionToAppwrite).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_orphan',
        customerId: 'cus_orphan',
        subscription: expect.objectContaining({ id: 'sub_orphan' }),
      }),
    )
  })

  it('does not create an orphan when the email cannot be resolved (no write)', async () => {
    h.stripeSubsList.mockResolvedValue({
      data: [{ id: 'sub_orphan2', status: 'active', customer: 'cus_orphan2' }],
      has_more: false,
    })
    h.listDocuments.mockResolvedValue({ documents: [] })
    h.stripeCustomersRetrieve.mockResolvedValue({ deleted: false, email: 'missing@test.com' })
    h.usersList.mockResolvedValue({ users: [] })

    const report = await stripeProvider.reconcile()

    expect(report.reconciled).toBe(0)
    expect(h.syncSubscriptionToAppwrite).not.toHaveBeenCalled()
  })
})

// ─── ROUTE: aggregated report + admin auth (9.7, 9.3, 9.1) ───────────────────

describe('POST /api/billing/reconcile — aggregation, failure isolation, admin auth', () => {
  const ADMIN = 'admin-secret-token'

  function makeReq(opts: { token?: string | null; provider?: string | null }) {
    const { token, provider } = opts
    return {
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'authorization' ? (token != null ? `Bearer ${token}` : '') : null,
      },
      nextUrl: { searchParams: { get: (k: string) => (k === 'provider' ? provider ?? null : null) } },
    } as never
  }

  beforeEach(() => {
    process.env.APPWRITE_API_KEY = ADMIN
  })

  it('rejects a request without a valid admin token with 401 and performs no reconciliation (9.1)', async () => {
    const res = await reconcileRoute(makeReq({ token: null, provider: 'all' }))
    expect(res.status).toBe(401)
    expect(h.enabledProviders).not.toHaveBeenCalled()
    expect(h.getProvider).not.toHaveBeenCalled()
  })

  it('aggregates totals and per-provider entries across enabled providers (9.7)', async () => {
    h.enabledProviders.mockReturnValue([
      {
        id: 'stripe',
        reconcile: vi.fn().mockResolvedValue({
          reconciled: 2,
          errors: 0,
          results: ['✅ stripe one', '• stripe unchanged'],
        }),
      },
      {
        id: 'dodopayments',
        reconcile: vi.fn().mockResolvedValue({
          reconciled: 1,
          errors: 1,
          results: ['✅ dodo created', '❌ dodo failed'],
        }),
      },
    ])

    const res = await reconcileRoute(makeReq({ token: ADMIN, provider: 'all' }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Totals sum across providers.
    expect(body.reconciled).toBe(3)
    expect(body.errors).toBe(1)
    expect(body.provider).toBe('all')

    // Per-provider entries present and correct.
    expect(body.providers).toEqual([
      { provider: 'stripe', reconciled: 2, errors: 0, ok: true },
      { provider: 'dodopayments', reconciled: 1, errors: 1, ok: true },
    ])

    // Combined per-subscription results tagged with their originating provider,
    // and the ❌ entry flagged as an error.
    expect(body.results).toHaveLength(4)
    expect(body.results).toContainEqual({ provider: 'dodopayments', detail: '❌ dodo failed', error: true })
    expect(body.results).toContainEqual({ provider: 'stripe', detail: '✅ stripe one', error: false })
  })

  it('continues past a provider that throws, counting it as an error (9.3)', async () => {
    h.enabledProviders.mockReturnValue([
      {
        id: 'stripe',
        reconcile: vi.fn().mockResolvedValue({ reconciled: 1, errors: 0, results: ['✅ stripe ok'] }),
      },
      {
        id: 'dodopayments',
        reconcile: vi.fn().mockRejectedValue(new Error('dodo down')),
      },
    ])

    const res = await reconcileRoute(makeReq({ token: ADMIN, provider: 'all' }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Stripe still reconciled; the dodo failure became one error and did not abort.
    expect(body.reconciled).toBe(1)
    expect(body.errors).toBe(1)
    expect(body.providers).toContainEqual({ provider: 'stripe', reconciled: 1, errors: 0, ok: true })
    expect(body.providers).toContainEqual({ provider: 'dodopayments', reconciled: 0, errors: 1, ok: false })
    expect(body.results.some((r: { detail: string }) => r.detail.includes('reconcile failed'))).toBe(true)
  })
})
