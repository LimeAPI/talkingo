/**
 * Unit tests for cross-device subscription hydration (Task 11.2).
 *
 * Covers Requirement 14:
 *  - 14.1 canonical `providerCustomerId` first, legacy fallback
 *  - 14.2 re-hydrate when the cached snapshot is older than 60s
 *  - 14.4 neither canonical nor legacy id → no active subscription, cache unchanged
 *  - 14.5 on hydration failure retain last-known cache and surface a verification error
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock the network layer used by the hydration helpers.
const authFetchMock = vi.fn()
vi.mock('@/lib/api/auth-fetch', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}))

import {
  syncFromAccountPrefs,
  getSubscriptionInfo,
  saveSubscriptionInfo,
  clearSubscription,
  isSubscriptionCacheStale,
  rehydrateIfStale,
  type SubscriptionInfo,
} from '@/lib/subscription/use-subscription'

const USER = 'user-1'

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  window.localStorage.clear()
  authFetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('syncFromAccountPrefs — canonical-first, legacy fallback (14.1)', () => {
  it('reads canonical providerCustomerId and subscriptionProvider', () => {
    const info = syncFromAccountPrefs(
      {
        providerCustomerId: 'cus_canon',
        subscriptionProvider: 'dodopayments',
        subscriptionStatus: 'active',
        subscriptionPlan: 'yearly',
      },
      USER,
    )

    expect(info.customerId).toBe('cus_canon')
    expect(info.provider).toBe('dodopayments')
    expect(info.status).toBe('active')
    // Persisted for instant rendering on next load.
    expect(getSubscriptionInfo(USER).customerId).toBe('cus_canon')
  })

  it('prefers canonical over legacy when both are present', () => {
    const info = syncFromAccountPrefs(
      {
        providerCustomerId: 'cus_canon',
        stripeCustomerId: 'cus_legacy_stripe',
        subscriptionStatus: 'active',
      },
      USER,
    )
    expect(info.customerId).toBe('cus_canon')
  })

  it('falls back to legacy stripeCustomerId and infers stripe provider', () => {
    const info = syncFromAccountPrefs(
      {
        stripeCustomerId: 'cus_legacy_stripe',
        subscriptionStatus: 'active',
      },
      USER,
    )
    expect(info.customerId).toBe('cus_legacy_stripe')
    expect(info.provider).toBe('stripe')
  })

  it('falls back to legacy dodopaymentsCustomerId and infers dodopayments provider', () => {
    const info = syncFromAccountPrefs(
      {
        dodopaymentsCustomerId: 'cus_legacy_dodo',
        subscriptionStatus: 'trialing',
      },
      USER,
    )
    expect(info.customerId).toBe('cus_legacy_dodo')
    expect(info.provider).toBe('dodopayments')
  })

  it('treats blank canonical id as absent and falls back to legacy', () => {
    const info = syncFromAccountPrefs(
      {
        providerCustomerId: '   ',
        dodopaymentsCustomerId: 'cus_legacy_dodo',
        subscriptionStatus: 'active',
      },
      USER,
    )
    expect(info.customerId).toBe('cus_legacy_dodo')
  })
})

describe('syncFromAccountPrefs — no customer id (14.4)', () => {
  it('returns no-subscription when neither canonical nor legacy id is present', () => {
    const info = syncFromAccountPrefs({ subscriptionStatus: 'active' }, USER)
    expect(info.status).toBe('none')
  })

  it('returns no-subscription when status is missing', () => {
    const info = syncFromAccountPrefs({ providerCustomerId: 'cus_x' }, USER)
    expect(info.status).toBe('none')
  })

  it('leaves the stored cache unchanged when there is no customer id', () => {
    const cached: SubscriptionInfo = { status: 'active', customerId: 'cus_prev', provider: 'stripe' }
    saveSubscriptionInfo(cached, USER)

    syncFromAccountPrefs({ subscriptionStatus: 'active' }, USER)

    // The previously-cached active subscription must remain untouched.
    expect(getSubscriptionInfo(USER).status).toBe('active')
    expect(getSubscriptionInfo(USER).customerId).toBe('cus_prev')
  })
})

describe('isSubscriptionCacheStale (14.2)', () => {
  it('is false when there is no subscription', () => {
    clearSubscription(USER)
    expect(isSubscriptionCacheStale(USER)).toBe(false)
  })

  it('is true when the cache was verified more than 60s ago', () => {
    saveSubscriptionInfo({ status: 'active', customerId: 'cus' }, USER)
    // saveSubscriptionInfo stamps verifiedAt = now; advance virtual clock past 60s.
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 61_000)
    expect(isSubscriptionCacheStale(USER)).toBe(true)
  })

  it('is false when the cache is fresh (verified within 60s)', () => {
    saveSubscriptionInfo({ status: 'active', customerId: 'cus' }, USER)
    expect(isSubscriptionCacheStale(USER)).toBe(false)
  })
})

describe('rehydrateIfStale (14.2, 14.5)', () => {
  it('returns the cached snapshot without a network call when fresh', async () => {
    saveSubscriptionInfo({ status: 'active', customerId: 'cus' }, USER)

    const result = await rehydrateIfStale(USER)

    expect(authFetchMock).not.toHaveBeenCalled()
    expect(result.verificationError).toBe(false)
    expect(result.info.status).toBe('active')
  })

  it('re-hydrates from the server when the cache is stale', async () => {
    saveSubscriptionInfo({ status: 'active', customerId: 'cus' }, USER)
    authFetchMock.mockResolvedValue(
      jsonResponse({ status: 'canceled', plan: 'monthly', customerId: 'cus', provider: 'stripe' }),
    )

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 61_000)

    const result = await rehydrateIfStale(USER)

    expect(authFetchMock).toHaveBeenCalled()
    expect(result.verificationError).toBe(false)
    expect(result.info.status).toBe('canceled')
    // Fresh value persisted.
    expect(getSubscriptionInfo(USER).status).toBe('canceled')
  })

  it('retains the last-known cache and surfaces a verification error on failure (14.5)', async () => {
    saveSubscriptionInfo({ status: 'active', customerId: 'cus', provider: 'stripe' }, USER)
    authFetchMock.mockRejectedValue(new Error('network down'))

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 61_000)

    const result = await rehydrateIfStale(USER)

    expect(result.verificationError).toBe(true)
    // Subscription is NOT dropped — cached active state is retained.
    expect(result.info.status).toBe('active')
    expect(result.info.customerId).toBe('cus')
    expect(getSubscriptionInfo(USER).status).toBe('active')
  })

  it('surfaces a verification error when both status endpoints are unreachable', async () => {
    saveSubscriptionInfo({ status: 'trialing', customerId: 'cus' }, USER)
    // Unified endpoint not ok, Stripe fallback not ok → no json.
    authFetchMock.mockResolvedValue(jsonResponse(null, false))

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 61_000)

    const result = await rehydrateIfStale(USER)

    expect(result.verificationError).toBe(true)
    expect(result.info.status).toBe('trialing')
  })
})
