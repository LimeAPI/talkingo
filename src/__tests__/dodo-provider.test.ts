/**
 * Unit tests — DodoProvider adapter
 *
 * Feature: unified-payment-experience, Task 6.3
 * _Requirements: 1.6, 6.5, 6.10, 8.8_
 *
 * Covers:
 *  - Unified status mapping (`mapDodoStatusToUnified`): active, pending→incomplete,
 *    on_hold→past_due, cancelled→canceled, expired, etc. (1.6)
 *  - Stable, provider-namespaced webhook event-id derivation
 *    (`dodopayments:{subId}:{type}:{periodEnd}`), identical across retries (8.8)
 *  - `syncFromCheckout` ownership mismatch rejection — throws, grants nothing (6.5)
 *  - `syncFromCheckout` tampered/unknown product rejection — throws, grants nothing (6.10)
 *  - `syncFromCheckout` pending payment returns null and grants nothing
 *
 * The DodoProvider is a thin adapter over the existing Dodo integration. We mock
 * the boundary modules (the Dodo SDK client, env/products, the shared
 * `syncToAppwrite` writer, the webhook verifier, and appwrite-server) so the
 * adapter's own logic — and the real `dodopayments/sync` helpers it delegates to —
 * are exercised against controlled inputs without touching any network or store.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Hoisted mock functions (referenced inside vi.mock factories) ────────────
const { retrieveMock, syncToAppwriteMock, getSubscriptionMock, verifyMock } = vi.hoisted(() => ({
  retrieveMock: vi.fn(),
  syncToAppwriteMock: vi.fn(),
  getSubscriptionMock: vi.fn(),
  verifyMock: vi.fn(),
}))

// Env + products: a fully-configured Dodo with known product ids.
vi.mock('@/lib/dodopayments/env', () => ({
  DODOPAYMENTS_ENV: {
    DODOPAYMENTS_API_KEY: 'test_api_key',
    DODOPAYMENTS_WEBHOOK_SECRET: 'test_webhook_secret',
    DODOPAYMENTS_PRODUCT_MONTHLY: 'prod_monthly',
    DODOPAYMENTS_PRODUCT_YEARLY: 'prod_yearly',
  },
  DODOPAYMENTS_PRODUCTS: { monthly: 'prod_monthly', yearly: 'prod_yearly' },
}))

// Dodo SDK client — only `subscriptions.retrieve` is needed for these tests.
vi.mock('@/lib/dodopayments/client', () => ({
  dodo: {
    subscriptions: {
      retrieve: (...args: unknown[]) => retrieveMock(...args),
    },
  },
}))

// Shared race-safe writer — assert it is (not) called; never touch a real store.
vi.mock('@/lib/payments/sync', () => ({
  syncToAppwrite: (...args: unknown[]) => syncToAppwriteMock(...args),
}))

// Appwrite admin reads.
vi.mock('@/lib/appwrite-server', () => ({
  getSubscription: (...args: unknown[]) => getSubscriptionMock(...args),
}))

// Webhook signature verifier — control the decoded payload / throw on bad sig.
vi.mock('standardwebhooks', () => ({
  Webhook: class {
    constructor(_secret: string) {}
    verify(body: string, headers: Record<string, string>) {
      return verifyMock(body, headers)
    }
  },
}))

import { dodoProvider } from '@/lib/payments/dodo-provider'
import { mapDodoStatusToUnified, toEpochMs } from '@/lib/dodopayments/sync'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Unified status mapping (Requirement 1.6) ────────────────────────────────

describe('mapDodoStatusToUnified — unified status mapping', () => {
  it('maps active-like statuses to "active"', () => {
    expect(mapDodoStatusToUnified('active')).toBe('active')
    expect(mapDodoStatusToUnified('succeeded')).toBe('active')
    expect(mapDodoStatusToUnified('paid')).toBe('active')
    expect(mapDodoStatusToUnified('renewed')).toBe('active')
  })

  it('maps pending → "incomplete"', () => {
    expect(mapDodoStatusToUnified('pending')).toBe('incomplete')
    expect(mapDodoStatusToUnified('incomplete')).toBe('incomplete')
  })

  it('maps on_hold and payment-failure statuses → "past_due"', () => {
    expect(mapDodoStatusToUnified('on_hold')).toBe('past_due')
    expect(mapDodoStatusToUnified('past_due')).toBe('past_due')
    expect(mapDodoStatusToUnified('failed')).toBe('past_due')
    expect(mapDodoStatusToUnified('payment_failed')).toBe('past_due')
  })

  it('maps cancelled/canceled → "canceled"', () => {
    expect(mapDodoStatusToUnified('cancelled')).toBe('canceled')
    expect(mapDodoStatusToUnified('canceled')).toBe('canceled')
    expect(mapDodoStatusToUnified('cancel_at_period_end')).toBe('canceled')
  })

  it('maps expired/terminated/incomplete_expired → "expired"', () => {
    expect(mapDodoStatusToUnified('expired')).toBe('expired')
    expect(mapDodoStatusToUnified('terminated')).toBe('expired')
    expect(mapDodoStatusToUnified('incomplete_expired')).toBe('expired')
  })

  it('maps trialing-like statuses → "trialing"', () => {
    expect(mapDodoStatusToUnified('trialing')).toBe('trialing')
    expect(mapDodoStatusToUnified('trial')).toBe('trialing')
    expect(mapDodoStatusToUnified('in_trial')).toBe('trialing')
  })

  it('maps unpaid → "unpaid"', () => {
    expect(mapDodoStatusToUnified('unpaid')).toBe('unpaid')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(mapDodoStatusToUnified('  ACTIVE ')).toBe('active')
    expect(mapDodoStatusToUnified('On_Hold')).toBe('past_due')
  })

  it('normalizes unknown / missing values to "incomplete" (never dropped)', () => {
    expect(mapDodoStatusToUnified('something_weird')).toBe('incomplete')
    expect(mapDodoStatusToUnified('')).toBe('incomplete')
    expect(mapDodoStatusToUnified(null)).toBe('incomplete')
    expect(mapDodoStatusToUnified(undefined)).toBe('incomplete')
  })
})

// ─── Stable webhook event-id derivation (Requirement 8.8) ────────────────────

describe('verifyWebhook — stable, namespaced event id', () => {
  const rawBody = '{"event":"payload"}'
  const headers = new Headers({
    'webhook-id': 'wh_1',
    'webhook-timestamp': '1700000000',
    'webhook-signature': 'v1,abc',
  })

  function payload() {
    return {
      type: 'subscription.active',
      data: {
        subscription_id: 'sub_123',
        status: 'active',
        next_billing_date: '2025-01-01T00:00:00Z',
        customer: { customer_id: 'cus_1' },
        metadata: { userId: 'user_1' },
      },
    }
  }

  it('derives the id from subscriptionId + type + periodEnd, namespaced as "dodopayments:"', async () => {
    verifyMock.mockReturnValue(payload())

    const event = await dodoProvider.verifyWebhook(rawBody, 'v1,abc', headers)

    const expectedPeriodEnd = toEpochMs('2025-01-01T00:00:00Z')
    expect(event.id).toBe(`dodopayments:sub_123:subscription.active:${expectedPeriodEnd}`)
    expect(event.id.startsWith('dodopayments:')).toBe(true)
    expect(event.type).toBe('subscription.active')
    expect(event.userId).toBe('user_1')
    expect(event.customerId).toBe('cus_1')
  })

  it('produces an identical id across retries of the same event (de-dupes)', async () => {
    verifyMock.mockReturnValue(payload())

    const first = await dodoProvider.verifyWebhook(rawBody, 'v1,abc', headers)
    const second = await dodoProvider.verifyWebhook(rawBody, 'v1,abc', headers)
    const third = await dodoProvider.verifyWebhook(rawBody, 'v1,abc', headers)

    expect(second.id).toBe(first.id)
    expect(third.id).toBe(first.id)
  })

  it('derives different ids for different subscription/type/period composites', async () => {
    verifyMock.mockReturnValueOnce(payload())
    const a = await dodoProvider.verifyWebhook(rawBody, 'v1,abc', headers)

    verifyMock.mockReturnValueOnce({
      type: 'subscription.cancelled',
      data: {
        subscription_id: 'sub_999',
        status: 'cancelled',
        next_billing_date: '2025-06-01T00:00:00Z',
        customer: { customer_id: 'cus_2' },
        metadata: { userId: 'user_2' },
      },
    })
    const b = await dodoProvider.verifyWebhook(rawBody, 'v1,abc', headers)

    expect(b.id).not.toBe(a.id)
  })

  it('rejects an invalid signature and never normalizes an event', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('Webhook verification failed')
    })

    await expect(dodoProvider.verifyWebhook(rawBody, 'bad', headers)).rejects.toThrow()
  })
})

// ─── syncFromCheckout ownership / tampered-price / pending (6.5, 6.10) ───────

describe('syncFromCheckout — ownership, tampered price, pending', () => {
  it('rejects an ownership mismatch and grants nothing (6.5)', async () => {
    retrieveMock.mockResolvedValue({
      subscription_id: 'sub_1',
      status: 'active',
      product_id: 'prod_monthly',
      customer: { customer_id: 'cus_1' },
      metadata: { userId: 'someone_else' },
      next_billing_date: '2025-01-01T00:00:00Z',
    })

    await expect(
      dodoProvider.syncFromCheckout({ userId: 'user_1', sessionId: 'sub_1' }),
    ).rejects.toThrow(/belong/i)

    expect(syncToAppwriteMock).not.toHaveBeenCalled()
  })

  it('rejects a tampered/unknown product id and grants nothing (6.10)', async () => {
    retrieveMock.mockResolvedValue({
      subscription_id: 'sub_1',
      status: 'active',
      product_id: 'prod_TAMPERED',
      customer: { customer_id: 'cus_1' },
      metadata: { userId: 'user_1' },
      next_billing_date: '2025-01-01T00:00:00Z',
    })

    await expect(
      dodoProvider.syncFromCheckout({ userId: 'user_1', sessionId: 'sub_1' }),
    ).rejects.toThrow(/invalid subscription price/i)

    expect(syncToAppwriteMock).not.toHaveBeenCalled()
  })

  it('returns null and grants nothing when the payment is still pending', async () => {
    retrieveMock.mockResolvedValue({
      subscription_id: 'sub_1',
      status: 'pending',
      product_id: 'prod_monthly',
      customer: { customer_id: 'cus_1' },
      metadata: { userId: 'user_1' },
    })

    const result = await dodoProvider.syncFromCheckout({ userId: 'user_1', sessionId: 'sub_1' })

    expect(result).toBeNull()
    expect(syncToAppwriteMock).not.toHaveBeenCalled()
  })

  it('persists and returns the unified snapshot when owned, confirmed, and a known product', async () => {
    retrieveMock.mockResolvedValue({
      subscription_id: 'sub_1',
      status: 'active',
      product_id: 'prod_yearly',
      customer: { customer_id: 'cus_1' },
      metadata: { userId: 'user_1' },
      next_billing_date: '2025-01-01T00:00:00Z',
    })

    const result = await dodoProvider.syncFromCheckout({ userId: 'user_1', sessionId: 'sub_1' })

    expect(result).not.toBeNull()
    expect(result!.provider).toBe('dodopayments')
    expect(result!.status).toBe('active')
    expect(result!.plan).toBe('yearly')
    expect(result!.providerCustomerId).toBe('cus_1')
    expect(result!.providerSubscriptionId).toBe('sub_1')
    expect(syncToAppwriteMock).toHaveBeenCalledTimes(1)
    expect(syncToAppwriteMock).toHaveBeenCalledWith('user_1', expect.objectContaining({
      provider: 'dodopayments',
      status: 'active',
      providerSubscriptionId: 'sub_1',
    }))
  })
})
