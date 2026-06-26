/**
 * Unit tests — GET /api/billing/history route
 *
 * Feature: unified-payment-experience, Task 16.1
 * _Requirements: 12.1, 12.2, 12.3_
 *
 * Covers:
 *  - 401 when unauthenticated
 *  - Empty list when the user has no stored subscription / no billing history (12.2)
 *  - Provider-agnostic invoice list ordered by date descending (12.1)
 *  - Resolves the provider from the STORED subscription (stripe vs dodopayments)
 *    and calls the matching standalone helper
 *  - 502 provider-unreachable when the helper throws, returning an error WITHOUT
 *    writing to Appwrite (the route is read-only) (12.3)
 *
 * The route is a thin orchestrator, so these tests mock its collaborators:
 *  - the auth guard (`@/lib/api/auth-guard` → verifyAuth)
 *  - the Appwrite read (`@/lib/appwrite-server` → getSubscription)
 *  - the standalone invoice helpers (`@/lib/stripe/invoices`, `@/lib/dodopayments/invoices`)
 * `toUnified` runs for real (it is a pure mapper).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SubscriptionDoc } from '@/lib/appwrite-server'
import type { UnifiedInvoice } from '@/lib/payments/provider'

// ─── Module mocks (hoisted above imports by vitest) ──────────────────────────

vi.mock('@/lib/api/auth-guard', () => ({
  verifyAuth: vi.fn(),
}))

vi.mock('@/lib/appwrite-server', () => ({
  getSubscription: vi.fn(),
}))

vi.mock('@/lib/stripe/invoices', () => ({
  listStripeInvoices: vi.fn(),
}))

vi.mock('@/lib/dodopayments/invoices', () => ({
  listDodoInvoices: vi.fn(),
}))

// Import mocked collaborators and the unit under test AFTER the mocks.
import { verifyAuth } from '@/lib/api/auth-guard'
import { getSubscription } from '@/lib/appwrite-server'
import { listStripeInvoices } from '@/lib/stripe/invoices'
import { listDodoInvoices } from '@/lib/dodopayments/invoices'
import { GET } from '@/app/api/billing/history/route'

const mockVerifyAuth = vi.mocked(verifyAuth)
const mockGetSubscription = vi.mocked(getSubscription)
const mockListStripeInvoices = vi.mocked(listStripeInvoices)
const mockListDodoInvoices = vi.mocked(listDodoInvoices)

/** Build a stored subscription document for the given provider. */
function makeDoc(overrides: Partial<SubscriptionDoc> = {}): SubscriptionDoc {
  return {
    userId: 'user_1',
    status: 'active',
    plan: 'monthly',
    updatedAt: 1000,
    provider: 'stripe',
    providerCustomerId: 'cus_123',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    cancelAtPeriodEnd: false,
    ...overrides,
  }
}

/** A minimal request stub — verifyAuth is mocked so headers are never read. */
const REQ = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  mockVerifyAuth.mockResolvedValue({ userId: 'user_1', jwt: 'jwt_1', email: 'user_1@example.com' })
})

// ─── 401 unauthenticated ──────────────────────────────────────────────────────

describe('GET /api/billing/history — authentication', () => {
  it('returns 401 when the request is unauthenticated', async () => {
    mockVerifyAuth.mockResolvedValue(null)

    const res = await GET(REQ)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
    // No subscription read or provider call should happen.
    expect(mockGetSubscription).not.toHaveBeenCalled()
    expect(mockListStripeInvoices).not.toHaveBeenCalled()
    expect(mockListDodoInvoices).not.toHaveBeenCalled()
  })
})

// ─── Empty list when no history (12.2) ─────────────────────────────────────────

describe('GET /api/billing/history — no billing history (12.2)', () => {
  it('returns an empty list (not an error) when there is no stored subscription', async () => {
    mockGetSubscription.mockResolvedValue(null)

    const res = await GET(REQ)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ invoices: [] })
    expect(mockListStripeInvoices).not.toHaveBeenCalled()
    expect(mockListDodoInvoices).not.toHaveBeenCalled()
  })

  it('returns an empty list when the stored doc has no resolvable customer id', async () => {
    // No provider and no legacy customer id → toUnified yields null.
    mockGetSubscription.mockResolvedValue(
      makeDoc({
        provider: undefined,
        providerCustomerId: undefined,
        stripeCustomerId: undefined,
        stripeSubscriptionId: undefined,
      }),
    )

    const res = await GET(REQ)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ invoices: [] })
  })
})

// ─── Ordered, provider-agnostic list (12.1) ────────────────────────────────────

describe('GET /api/billing/history — ordered unified list (12.1)', () => {
  it('returns Stripe invoices ordered by date descending', async () => {
    mockGetSubscription.mockResolvedValue(makeDoc({ provider: 'stripe' }))

    const unordered: UnifiedInvoice[] = [
      { id: 'in_old', date: 1_000, amount: 5, currency: 'usd', status: 'paid', provider: 'stripe' },
      {
        id: 'in_new',
        date: 3_000,
        amount: 9,
        currency: 'usd',
        status: 'paid',
        provider: 'stripe',
        receiptUrl: 'https://receipt/new',
      },
      { id: 'in_mid', date: 2_000, amount: 7, currency: 'usd', status: 'open', provider: 'stripe' },
    ]
    mockListStripeInvoices.mockResolvedValue(unordered)

    const res = await GET(REQ)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(mockListStripeInvoices).toHaveBeenCalledWith('cus_123')
    expect(mockListDodoInvoices).not.toHaveBeenCalled()

    // Ordered by date DESC: new, mid, old.
    expect(body.invoices.map((i: { id: string }) => i.id)).toEqual(['in_new', 'in_mid', 'in_old'])
    // Dates serialized to ISO-8601 and the optional receipt URL preserved.
    expect(body.invoices[0]).toMatchObject({
      id: 'in_new',
      date: new Date(3_000).toISOString(),
      amount: 9,
      currency: 'usd',
      status: 'paid',
      provider: 'stripe',
      receiptUrl: 'https://receipt/new',
    })
    // Entries without a receipt omit the field.
    expect(body.invoices[1].receiptUrl).toBeUndefined()
  })

  it('resolves the Dodo helper when the stored subscription is dodopayments', async () => {
    mockGetSubscription.mockResolvedValue(
      makeDoc({
        provider: 'dodopayments',
        providerCustomerId: 'dodo_cus_9',
        stripeCustomerId: undefined,
        stripeSubscriptionId: undefined,
        dodopaymentsCustomerId: 'dodo_cus_9',
      }),
    )
    mockListDodoInvoices.mockResolvedValue([
      {
        id: 'pay_1',
        date: 2_000,
        amount: 12,
        currency: 'inr',
        status: 'succeeded',
        provider: 'dodopayments',
      },
    ])

    const res = await GET(REQ)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(mockListDodoInvoices).toHaveBeenCalledWith('dodo_cus_9')
    expect(mockListStripeInvoices).not.toHaveBeenCalled()
    expect(body.invoices[0].provider).toBe('dodopayments')
  })

  it('returns an empty list when the provider reports no invoices', async () => {
    mockGetSubscription.mockResolvedValue(makeDoc({ provider: 'stripe' }))
    mockListStripeInvoices.mockResolvedValue([])

    const res = await GET(REQ)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ invoices: [] })
  })
})

// ─── Provider unreachable (12.3) ───────────────────────────────────────────────

describe('GET /api/billing/history — provider unreachable (12.3)', () => {
  it('returns 502 without altering stored data when the provider fetch throws', async () => {
    mockGetSubscription.mockResolvedValue(makeDoc({ provider: 'stripe' }))
    mockListStripeInvoices.mockRejectedValue(new Error('network down'))

    const res = await GET(REQ)
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe('provider_unreachable')
    // The route is read-only: only a single read happened, no write path exists.
    expect(mockGetSubscription).toHaveBeenCalledTimes(1)
  })
})
