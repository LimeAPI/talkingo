/**
 * Unit tests — StripeProvider adapter
 *
 * Feature: unified-payment-experience, Task 5.2
 * _Requirements: 1.5, 1.9, 6.5, 6.10_
 *
 * Covers:
 *  - Stripe status → UnifiedStatus mapping surfaced through `syncFromCheckout`
 *    (active, trialing, past_due, canceled, unpaid, incomplete pass through;
 *     incomplete_expired → expired; paused → past_due; unknown → incomplete) (1.5)
 *  - `syncFromCheckout` ownership mismatch rejection: the hardened
 *    `syncFromCheckoutSession` enforces ownership; when it throws, the provider
 *    propagates the error, does NOT grant premium, and leaves Appwrite untouched (6.5, 1.9)
 *  - `syncFromCheckout` tampered/unknown-price rejection: when the underlying
 *    sync throws an invalid-price error, the provider propagates it and never
 *    persists state (6.10, 1.9)
 *  - `syncFromCheckout` pending (null) result: returns null without persisting (1.9)
 *  - Error preservation: when a Stripe call throws in `cancel` / `changePlan`,
 *    the prior stored state is preserved (the shared `syncToAppwrite` writer is
 *    never invoked) (1.9)
 *
 * The provider is a thin adapter, so these tests mock its collaborators:
 *  - the Stripe SDK client (`@/lib/stripe/client`)
 *  - the hardened Stripe sync module (`@/lib/stripe/sync`)
 *  - the shared race-safe writer (`@/lib/payments/sync` → `syncToAppwrite`)
 *  - the Appwrite reads (`@/lib/appwrite-server`)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SubscriptionDoc } from '@/lib/appwrite-server'

// ─── Module mocks (hoisted above imports by vitest) ──────────────────────────

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      update: vi.fn(),
      retrieve: vi.fn(),
    },
    customers: { create: vi.fn(), retrieve: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
  },
}))

vi.mock('@/lib/payments/sync', () => ({
  syncToAppwrite: vi.fn().mockResolvedValue({ status: 'written' }),
}))

vi.mock('@/lib/stripe/sync', () => ({
  syncFromCheckoutSession: vi.fn(),
  detectPlanFromSubscription: vi.fn(() => 'monthly'),
}))

vi.mock('@/lib/appwrite-server', () => ({
  getSubscription: vi.fn(),
  getSubscriptionByCustomerId: vi.fn(),
}))

// Import the mocked collaborators and the unit under test AFTER the mocks.
import { stripe } from '@/lib/stripe/client'
import { syncToAppwrite } from '@/lib/payments/sync'
import { syncFromCheckoutSession } from '@/lib/stripe/sync'
import { getSubscription } from '@/lib/appwrite-server'
import { stripeProvider } from '@/lib/payments/stripe-provider'

// ─── Typed handles to the mocks ──────────────────────────────────────────────

const mockSyncToAppwrite = vi.mocked(syncToAppwrite)
const mockSyncFromCheckoutSession = vi.mocked(syncFromCheckoutSession)
const mockGetSubscription = vi.mocked(getSubscription)
const mockStripeUpdate = vi.mocked(stripe.subscriptions.update)
const mockStripeRetrieve = vi.mocked(stripe.subscriptions.retrieve)

/** A non-null checkout-sync result with the given raw Stripe status. */
function checkoutResult(status: string, plan: 'monthly' | 'yearly' = 'monthly') {
  return {
    // `status` is typed as AppwriteStatus by the real fn; cast for exotic inputs.
    status: status as never,
    plan,
    customerId: 'cus_123',
    subscriptionId: 'sub_123',
    trialEnd: undefined,
    periodEnd: undefined,
    cancelAtPeriodEnd: false,
  }
}

/** Build a stored subscription document with sensible defaults. */
function makeDoc(overrides: Partial<SubscriptionDoc> = {}): SubscriptionDoc {
  return {
    userId: 'user_1',
    status: 'active',
    plan: 'monthly',
    updatedAt: 1000,
    providerCustomerId: 'cus_123',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    cancelAtPeriodEnd: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSyncToAppwrite.mockResolvedValue({ status: 'written' })
})

// ─── Status mapping (1.5) ─────────────────────────────────────────────────────

describe('StripeProvider.syncFromCheckout — status mapping to UnifiedStatus (1.5)', () => {
  it.each([
    ['active', 'active'],
    ['trialing', 'trialing'],
    ['past_due', 'past_due'],
    ['canceled', 'canceled'],
    ['unpaid', 'unpaid'],
    ['incomplete', 'incomplete'],
    ['incomplete_expired', 'expired'],
    ['paused', 'past_due'],
    ['something_unexpected', 'incomplete'],
    ['', 'incomplete'],
  ] as const)('maps Stripe status "%s" → UnifiedStatus "%s"', async (raw, expected) => {
    mockSyncFromCheckoutSession.mockResolvedValue(checkoutResult(raw))

    const result = await stripeProvider.syncFromCheckout({
      userId: 'user_1',
      sessionId: 'cs_test_1',
    })

    expect(result).not.toBeNull()
    expect(result!.status).toBe(expected)
    // The mapped snapshot is conformant and persisted via the shared writer.
    expect(result!.provider).toBe('stripe')
    expect(mockSyncToAppwrite).toHaveBeenCalledOnce()
    expect(mockSyncToAppwrite).toHaveBeenCalledWith(
      'user_1',
      expect.objectContaining({ status: expected, provider: 'stripe' }),
    )
  })

  it('returns a fully conformant Unified_Subscription snapshot (1.5)', async () => {
    mockSyncFromCheckoutSession.mockResolvedValue({
      status: 'active' as never,
      plan: 'yearly',
      customerId: 'cus_abc',
      subscriptionId: 'sub_abc',
      trialEnd: 111,
      periodEnd: 222,
      cancelAtPeriodEnd: true,
    })

    const result = await stripeProvider.syncFromCheckout({
      userId: 'user_9',
      sessionId: 'cs_test_9',
    })

    expect(result).toMatchObject({
      provider: 'stripe',
      providerCustomerId: 'cus_abc',
      providerSubscriptionId: 'sub_abc',
      status: 'active',
      plan: 'yearly',
      trialEnd: 111,
      periodEnd: 222,
      cancelAtPeriodEnd: true,
    })
    expect(typeof result!.updatedAt).toBe('number')
  })
})

// ─── Ownership mismatch rejection (6.5, 1.9) ──────────────────────────────────

describe('StripeProvider.syncFromCheckout — ownership mismatch (6.5, 1.9)', () => {
  it('propagates the ownership error and never grants premium / writes state', async () => {
    // The hardened syncFromCheckoutSession asserts ownership and throws on mismatch.
    mockSyncFromCheckoutSession.mockRejectedValue(
      new Error('Session does not belong to this user'),
    )

    await expect(
      stripeProvider.syncFromCheckout({ userId: 'attacker', sessionId: 'cs_victim' }),
    ).rejects.toThrow(/does not belong/i)

    // No premium granted, Appwrite state unchanged.
    expect(mockSyncToAppwrite).not.toHaveBeenCalled()
  })
})

// ─── Tampered / unknown price rejection (6.10, 1.9) ───────────────────────────

describe('StripeProvider.syncFromCheckout — tampered price (6.10, 1.9)', () => {
  it('propagates the invalid-price error and never writes state', async () => {
    mockSyncFromCheckoutSession.mockRejectedValue(new Error('Invalid subscription price'))

    await expect(
      stripeProvider.syncFromCheckout({ userId: 'user_1', sessionId: 'cs_tampered' }),
    ).rejects.toThrow(/invalid subscription price/i)

    expect(mockSyncToAppwrite).not.toHaveBeenCalled()
  })
})

// ─── Pending payment → null, no write (1.9) ───────────────────────────────────

describe('StripeProvider.syncFromCheckout — pending payment (1.9)', () => {
  it('returns null and does not persist when the underlying sync is not ready', async () => {
    mockSyncFromCheckoutSession.mockResolvedValue(null)

    const result = await stripeProvider.syncFromCheckout({
      userId: 'user_1',
      sessionId: 'cs_pending',
    })

    expect(result).toBeNull()
    expect(mockSyncToAppwrite).not.toHaveBeenCalled()
  })
})

// ─── Error preservation of prior state (1.9) ──────────────────────────────────

describe('StripeProvider.cancel — error preservation (1.9)', () => {
  it('preserves prior state when the Stripe update throws (no write)', async () => {
    mockGetSubscription.mockResolvedValue(makeDoc())
    mockStripeUpdate.mockRejectedValue(new Error('Stripe API unavailable'))

    await expect(stripeProvider.cancel({ userId: 'user_1' })).rejects.toThrow(
      /stripe api unavailable/i,
    )

    expect(mockSyncToAppwrite).not.toHaveBeenCalled()
  })

  it('rejects (no_subscription) and writes nothing when there is no stored subscription', async () => {
    mockGetSubscription.mockResolvedValue(null)

    await expect(stripeProvider.cancel({ userId: 'user_1' })).rejects.toThrow(/no_subscription/i)

    expect(mockStripeUpdate).not.toHaveBeenCalled()
    expect(mockSyncToAppwrite).not.toHaveBeenCalled()
  })
})

describe('StripeProvider.changePlan — error preservation (1.9)', () => {
  it('preserves prior state when retrieving the live subscription throws (no write)', async () => {
    // Stored on monthly; request yearly so it does not short-circuit as a no-op.
    mockGetSubscription.mockResolvedValue(makeDoc({ plan: 'monthly' }))
    mockStripeRetrieve.mockRejectedValue(new Error('Stripe retrieve failed'))

    await expect(
      stripeProvider.changePlan({ userId: 'user_1', plan: 'yearly' }),
    ).rejects.toThrow(/stripe retrieve failed/i)

    expect(mockStripeUpdate).not.toHaveBeenCalled()
    expect(mockSyncToAppwrite).not.toHaveBeenCalled()
  })

  it('rejects (no_subscription) and writes nothing when there is no stored subscription', async () => {
    mockGetSubscription.mockResolvedValue(null)

    await expect(
      stripeProvider.changePlan({ userId: 'user_1', plan: 'yearly' }),
    ).rejects.toThrow(/no_subscription/i)

    expect(mockStripeRetrieve).not.toHaveBeenCalled()
    expect(mockSyncToAppwrite).not.toHaveBeenCalled()
  })
})
