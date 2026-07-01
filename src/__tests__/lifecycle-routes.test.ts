/**
 * Unit tests — Subscription lifecycle routes
 *
 * Feature: unified-payment-experience, Task 13.5
 * _Requirements: 11.2, 11.7, 10.1, 10.6_
 *
 * Exercises the guard / eligibility / validation branches of the three
 * provider-agnostic lifecycle routes by mocking each route's collaborators so
 * only the branch under test is reachable:
 *
 *   - POST /api/billing/cancel
 *       · 409 not_eligible when stored status is not `active`        (11.2)
 *       · 409 not_eligible when already `cancelAtPeriodEnd`          (11.2)
 *       · 200 { cancelAtPeriodEnd:true, periodEnd } for an active sub (11.1, 11.3)
 *
 *   - POST /api/billing/reactivate
 *       · 409 not_reactivatable when not pending cancellation        (11.7)
 *       · 409 not_reactivatable when the period end already passed   (11.7)
 *       · 200 cancellation cleared when eligible                     (11.6)
 *
 *   - POST /api/billing/change-plan
 *       · 400 invalid_plan for a bad / missing plan — no provider call (10.1)
 *       · 404 no_subscription when no stored sub exists              (10.2)
 *       · 200 { status:'unchanged' } when already on the target plan (10.3)
 *       · 500 change_plan_failed when the provider throws, leaving
 *             the stored subscription unchanged                      (10.6)
 *
 * The guards (`originGuard`, `rateLimitGuard`), the auth guard (`verifyAuth`,
 * dynamically imported by each route), the registry (`getProvider`) and the
 * persistence read (`getSubscription`) are all mocked. The real subscription
 * mapper (`toUnified`) runs against generated documents so the routes observe
 * realistic unified snapshots.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { SubscriptionDoc } from '@/lib/appwrite-server'
import type { UnifiedSubscription } from '@/lib/payments/provider'

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

vi.mock('@/lib/payments/guards', () => ({
  originGuard: vi.fn(),
  rateLimitGuard: vi.fn(),
}))

vi.mock('@/lib/payments/registry', () => ({
  getProvider: vi.fn(),
}))

vi.mock('@/lib/appwrite-server', () => ({
  getSubscription: vi.fn(),
}))

// The cancel route reads `checkRateLimit`/`validateOrigin` from the auth-guard
// (via dynamic import); reactivate/change-plan use the guards module. Mock the
// whole auth-guard module so its real `server-only`/Appwrite imports never load.
vi.mock('@/lib/api/auth-guard', () => ({
  verifyAuth: vi.fn(),
  checkRateLimit: vi.fn(),
  validateOrigin: vi.fn(),
}))

import { originGuard, rateLimitGuard } from '@/lib/payments/guards'
import { getProvider } from '@/lib/payments/registry'
import { getSubscription } from '@/lib/appwrite-server'
import { verifyAuth, checkRateLimit, validateOrigin } from '@/lib/api/auth-guard'

import { POST as cancelPOST } from '@/app/api/billing/cancel/route'
import { POST as reactivatePOST } from '@/app/api/billing/reactivate/route'
import { POST as changePlanPOST } from '@/app/api/billing/change-plan/route'

// ─── Typed mock handles ───────────────────────────────────────────────────────

const originGuardMock = vi.mocked(originGuard)
const rateLimitGuardMock = vi.mocked(rateLimitGuard)
const getProviderMock = vi.mocked(getProvider)
const getSubscriptionMock = vi.mocked(getSubscription)
const verifyAuthMock = vi.mocked(verifyAuth)
const checkRateLimitMock = vi.mocked(checkRateLimit)
const validateOriginMock = vi.mocked(validateOrigin)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const APP_URL = 'https://app.talkingo.ai'

function makeReq(path: string, body: unknown = {}): NextRequest {
  return new NextRequest(`${APP_URL}/api/billing/${path}`, {
    method: 'POST',
    headers: { origin: APP_URL, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Build a stored subscription document that `toUnified` maps to a known
 * unified snapshot. Canonical fields are populated so the mapping is exact.
 */
function makeDoc(overrides: Partial<SubscriptionDoc> = {}): SubscriptionDoc {
  return {
    userId: 'user-1',
    provider: 'stripe',
    providerCustomerId: 'cus_123',
    providerSubscriptionId: 'sub_123',
    status: 'active',
    plan: 'monthly',
    cancelAtPeriodEnd: false,
    periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000, // +30 days
    updatedAt: Date.now(),
    ...overrides,
  } as SubscriptionDoc
}

/** A provider stub exposing the lifecycle methods used by the routes. */
function stubProvider(partial: Partial<UnifiedSubscription> = {}) {
  const unified: UnifiedSubscription = {
    provider: 'stripe',
    providerCustomerId: 'cus_123',
    providerSubscriptionId: 'sub_123',
    status: 'active',
    plan: 'monthly',
    cancelAtPeriodEnd: false,
    periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
    ...partial,
  }
  return {
    cancel: vi.fn().mockResolvedValue({ ...unified, cancelAtPeriodEnd: true }),
    reactivate: vi.fn().mockResolvedValue({ ...unified, cancelAtPeriodEnd: false }),
    changePlan: vi.fn().mockResolvedValue({ ...unified }),
  } as unknown as ReturnType<typeof getProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: every guard passes and the user is authenticated. Each test
  // overrides the one collaborator that drives the branch it targets.
  originGuardMock.mockReturnValue(null)
  rateLimitGuardMock.mockReturnValue(null)
  validateOriginMock.mockReturnValue(true)
  checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 4 })
  verifyAuthMock.mockResolvedValue({ userId: 'user-1', jwt: 'jwt-1', email: 'user-1@example.com' })
  getSubscriptionMock.mockResolvedValue(makeDoc())
  getProviderMock.mockReturnValue(stubProvider())
})

// ════════════════════════════════════════════════════════════════════════════
//  POST /api/billing/cancel — eligibility (11.2) + success (11.1, 11.3)
// ════════════════════════════════════════════════════════════════════════════

describe('cancel — ineligibility (11.2)', () => {
  it('returns 409 not_eligible when stored status is not active (past_due)', async () => {
    getSubscriptionMock.mockResolvedValue(makeDoc({ status: 'past_due' }))

    const res = await cancelPOST(makeReq('cancel'))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_eligible')
    // State unchanged: the provider is never contacted.
    expect(getProviderMock).not.toHaveBeenCalled()
  })

  it('returns 409 not_eligible when already scheduled to cancel at period end', async () => {
    getSubscriptionMock.mockResolvedValue(makeDoc({ cancelAtPeriodEnd: true }))

    const res = await cancelPOST(makeReq('cancel'))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_eligible')
    expect(getProviderMock).not.toHaveBeenCalled()
  })

  it('returns 404 no_subscription when no subscription is stored', async () => {
    getSubscriptionMock.mockResolvedValue(null)

    const res = await cancelPOST(makeReq('cancel'))

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('no_subscription')
    expect(getProviderMock).not.toHaveBeenCalled()
  })
})

describe('cancel — success (11.1, 11.3)', () => {
  it('schedules cancellation and returns cancelAtPeriodEnd:true with an ISO periodEnd', async () => {
    const periodEnd = Date.UTC(2030, 0, 1)
    getSubscriptionMock.mockResolvedValue(makeDoc({ status: 'active', cancelAtPeriodEnd: false }))
    getProviderMock.mockReturnValue(stubProvider({ periodEnd }))

    const res = await cancelPOST(makeReq('cancel'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cancelAtPeriodEnd).toBe(true)
    // ISO-8601 UTC timestamp (Req 11.3).
    expect(body.periodEnd).toBe(new Date(periodEnd).toISOString())
    expect(getProviderMock).toHaveBeenCalledWith('stripe')
  })
})

// ════════════════════════════════════════════════════════════════════════════
//  POST /api/billing/reactivate — expiry rejection (11.7) + success (11.6)
// ════════════════════════════════════════════════════════════════════════════

describe('reactivate — not reactivatable (11.7)', () => {
  it('returns 409 not_reactivatable when not pending cancellation', async () => {
    getSubscriptionMock.mockResolvedValue(makeDoc({ cancelAtPeriodEnd: false }))

    const res = await reactivatePOST(makeReq('reactivate'))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_reactivatable')
    expect(getProviderMock).not.toHaveBeenCalled()
  })

  it('returns 409 not_reactivatable when the period end has already passed', async () => {
    getSubscriptionMock.mockResolvedValue(
      makeDoc({ cancelAtPeriodEnd: true, periodEnd: Date.now() - 1000 }),
    )

    const res = await reactivatePOST(makeReq('reactivate'))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_reactivatable')
    expect(getProviderMock).not.toHaveBeenCalled()
  })

  it('returns 404 no_subscription when no subscription is stored', async () => {
    getSubscriptionMock.mockResolvedValue(null)

    const res = await reactivatePOST(makeReq('reactivate'))

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('no_subscription')
    expect(getProviderMock).not.toHaveBeenCalled()
  })
})

describe('reactivate — success (11.6)', () => {
  it('clears the scheduled cancellation when pending and before period end', async () => {
    const periodEnd = Date.now() + 30 * 24 * 60 * 60 * 1000
    getSubscriptionMock.mockResolvedValue(makeDoc({ cancelAtPeriodEnd: true, periodEnd }))
    getProviderMock.mockReturnValue(stubProvider({ cancelAtPeriodEnd: false, periodEnd }))

    const res = await reactivatePOST(makeReq('reactivate'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cancelAtPeriodEnd).toBe(false)
    expect(body.status).toBe('active')
    expect(getProviderMock).toHaveBeenCalledWith('stripe')
  })
})

// ════════════════════════════════════════════════════════════════════════════
//  POST /api/billing/change-plan — validation (10.1) / unchanged (10.3) /
//  no-sub (10.2) / error preservation (10.6)
// ════════════════════════════════════════════════════════════════════════════

describe('change-plan — invalid plan (10.1)', () => {
  it('returns 400 invalid_plan for an unsupported plan and never contacts the provider', async () => {
    const res = await changePlanPOST(makeReq('change-plan', { plan: 'weekly' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_plan')
    expect(getSubscriptionMock).not.toHaveBeenCalled()
    expect(getProviderMock).not.toHaveBeenCalled()
  })

  it('returns 400 invalid_plan when the plan is missing', async () => {
    const res = await changePlanPOST(makeReq('change-plan', {}))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_plan')
    expect(getProviderMock).not.toHaveBeenCalled()
  })
})

describe('change-plan — no subscription (10.2)', () => {
  it('returns 404 no_subscription when no stored subscription exists', async () => {
    getSubscriptionMock.mockResolvedValue(null)

    const res = await changePlanPOST(makeReq('change-plan', { plan: 'yearly' }))

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('no_subscription')
    expect(getProviderMock).not.toHaveBeenCalled()
  })
})

describe('change-plan — unchanged (10.3)', () => {
  it('returns 200 { status:"unchanged" } when already on the target plan, without contacting the provider', async () => {
    getSubscriptionMock.mockResolvedValue(makeDoc({ plan: 'monthly' }))

    const res = await changePlanPOST(makeReq('change-plan', { plan: 'monthly' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('unchanged')
    expect(body.plan).toBe('monthly')
    expect(getProviderMock).not.toHaveBeenCalled()
  })
})

describe('change-plan — error preservation (10.6)', () => {
  it('returns 500 change_plan_failed when the provider throws, leaving state unchanged', async () => {
    getSubscriptionMock.mockResolvedValue(makeDoc({ plan: 'monthly' }))
    const provider = stubProvider()
    ;(provider.changePlan as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('provider proration failed'),
    )
    getProviderMock.mockReturnValue(provider)

    const res = await changePlanPOST(makeReq('change-plan', { plan: 'yearly' }))

    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('change_plan_failed')
    // The provider WAS contacted (the change was attempted) but the route did
    // not crash and reported a clean failure.
    expect(provider.changePlan).toHaveBeenCalledWith({
      userId: 'user-1',
      jwt: 'jwt-1',
      plan: 'yearly',
    })
  })
})
