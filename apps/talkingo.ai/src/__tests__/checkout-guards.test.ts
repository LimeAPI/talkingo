/**
 * Unit tests — Provider-agnostic checkout route guards
 *
 * Feature: unified-payment-experience, Task 9.3
 * _Requirements: 5.2, 5.3, 5.4, 5.5, 5.7, 5.10_
 *
 * Exercises each guard branch of `POST /api/billing/checkout` in isolation by
 * mocking the route's collaborators so only the branch under test is reachable:
 *
 *  - 403 forbidden_origin    → origin missing / not allowlisted        (5.2)
 *  - 401 unauthorized        → no valid authenticated session          (5.3)
 *  - 429 rate_limited        → burst over budget, integer Retry-After  (5.4)
 *  - 400 invalid_provider    → provider not stripe|dodopayments        (5.5)
 *  - 400 invalid_plan        → plan not in the allowed set             (5.5)
 *  - 503 provider_unavailable→ resolved provider disabled/misconfigured(5.7)
 *  - 502 provider_error      → createCheckout throws / no url / timeout (5.10)
 *
 * The guards (`originGuard`, `rateLimitGuard`), the registry (`getProvider`),
 * the auth guard (`verifyAuth`, dynamically imported by the route) and the
 * persistence read (`getSubscription`) are all mocked. Each test sets the
 * collaborators so that every earlier guard passes, letting the assertion
 * target exactly one branch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

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

// The route imports verifyAuth via a dynamic `await import(...)`; vi.mock still
// intercepts the module so the real auth-guard (and its `server-only`/Appwrite
// imports) never loads.
vi.mock('@/lib/api/auth-guard', () => ({
  verifyAuth: vi.fn(),
}))

import { originGuard, rateLimitGuard } from '@/lib/payments/guards'
import { getProvider } from '@/lib/payments/registry'
import { getSubscription } from '@/lib/appwrite-server'
import { verifyAuth } from '@/lib/api/auth-guard'
import { POST } from '@/app/api/billing/checkout/route'

// ─── Typed mock handles ───────────────────────────────────────────────────────

const originGuardMock = vi.mocked(originGuard)
const rateLimitGuardMock = vi.mocked(rateLimitGuard)
const getProviderMock = vi.mocked(getProvider)
const getSubscriptionMock = vi.mocked(getSubscription)
const verifyAuthMock = vi.mocked(verifyAuth)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const APP_URL = 'https://app.talkingo.ai'

function makeReq(body: unknown): NextRequest {
  return new NextRequest(`${APP_URL}/api/billing/checkout`, {
    method: 'POST',
    headers: { origin: APP_URL, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** A provider stub whose `createCheckout` resolves to a hosted URL. */
function okProvider(url = `${APP_URL}/checkout/session`) {
  return {
    createCheckout: vi.fn().mockResolvedValue({ url, providerCustomerId: 'cus_123' }),
  } as unknown as ReturnType<typeof getProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: every guard passes, user is authenticated, no existing sub, and
  // the resolved provider creates a checkout URL. Each test overrides the one
  // collaborator that drives the branch it targets.
  originGuardMock.mockReturnValue(null)
  rateLimitGuardMock.mockReturnValue(null)
  verifyAuthMock.mockResolvedValue({ userId: 'user-1', jwt: 'jwt-1', email: 'user-1@example.com' })
  getSubscriptionMock.mockResolvedValue(null)
  getProviderMock.mockReturnValue(okProvider())
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── 403 forbidden origin (5.2) ────────────────────────────────────────────────

describe('checkout — origin guard (5.2)', () => {
  it('returns the originGuard 403 forbidden_origin response and stops', async () => {
    originGuardMock.mockReturnValue(
      NextResponse.json({ error: 'forbidden_origin' }, { status: 403 }),
    )

    const res = await POST(makeReq({ provider: 'stripe', plan: 'monthly' }))

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden_origin')
    // No session is created — auth and provider resolution never run.
    expect(verifyAuthMock).not.toHaveBeenCalled()
    expect(getProviderMock).not.toHaveBeenCalled()
  })
})

// ─── 401 unauthorized (5.3) ─────────────────────────────────────────────────────

describe('checkout — auth guard (5.3)', () => {
  it('returns 401 unauthorized when verifyAuth resolves null', async () => {
    verifyAuthMock.mockResolvedValue(null)

    const res = await POST(makeReq({ provider: 'stripe', plan: 'monthly' }))

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('unauthorized')
    // No rate-limit check or provider resolution after a failed auth.
    expect(rateLimitGuardMock).not.toHaveBeenCalled()
    expect(getProviderMock).not.toHaveBeenCalled()
  })
})

// ─── 429 rate limited (5.4) ─────────────────────────────────────────────────────

describe('checkout — rate-limit guard (5.4)', () => {
  it('returns the rateLimitGuard 429 with an integer Retry-After header', async () => {
    rateLimitGuardMock.mockReturnValue(
      NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': '42' } },
      ),
    )

    const res = await POST(makeReq({ provider: 'stripe', plan: 'monthly' }))

    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('rate_limited')

    const retryAfter = res.headers.get('Retry-After')
    expect(retryAfter).toBeTruthy()
    const value = Number(retryAfter)
    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(60)

    // No checkout session is created when rate limited.
    expect(getProviderMock).not.toHaveBeenCalled()
  })

  it('keys the rate limiter by the authenticated user id', async () => {
    await POST(makeReq({ provider: 'stripe', plan: 'monthly' }))
    expect(rateLimitGuardMock).toHaveBeenCalledWith(
      'billing:checkout:user-1',
      expect.any(Number),
      expect.any(Number),
    )
  })
})

// ─── 400 invalid provider / plan (5.5) ──────────────────────────────────────────

describe('checkout — provider/plan validation (5.5)', () => {
  it('returns 400 invalid_provider for an unsupported provider', async () => {
    const res = await POST(makeReq({ provider: 'paypal', plan: 'monthly' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_provider')
    expect(getProviderMock).not.toHaveBeenCalled()
  })

  it('returns 400 invalid_provider when the provider is missing', async () => {
    const res = await POST(makeReq({ plan: 'monthly' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_provider')
  })

  it('returns 400 invalid_plan for an unsupported plan', async () => {
    const res = await POST(makeReq({ provider: 'stripe', plan: 'weekly' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_plan')
    expect(getProviderMock).not.toHaveBeenCalled()
  })

  it('returns 400 invalid_plan when the plan is missing', async () => {
    const res = await POST(makeReq({ provider: 'dodopayments' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_plan')
  })

  it('accepts both registered providers as valid', async () => {
    for (const provider of ['stripe', 'dodopayments']) {
      const res = await POST(makeReq({ provider, plan: 'yearly' }))
      expect(res.status).toBe(200)
    }
  })
})

// ─── 503 provider unavailable (5.7) ──────────────────────────────────────────────

describe('checkout — disabled/misconfigured provider (5.7)', () => {
  it('returns 503 provider_unavailable when getProvider throws "not configured"', async () => {
    getProviderMock.mockImplementation(() => {
      throw new Error('Provider not configured: stripe')
    })

    const res = await POST(makeReq({ provider: 'stripe', plan: 'monthly' }))

    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('provider_unavailable')
  })

  it('returns 400 invalid_provider when getProvider throws an unknown-provider error', async () => {
    // A registry resolution failure that is not "not configured" is a bad id.
    getProviderMock.mockImplementation(() => {
      throw new Error('Unknown provider: stripe')
    })

    const res = await POST(makeReq({ provider: 'stripe', plan: 'monthly' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_provider')
  })
})

// ─── 502 provider error (5.10) ───────────────────────────────────────────────────

describe('checkout — provider failure (5.10)', () => {
  it('returns 502 provider_error when createCheckout throws', async () => {
    getProviderMock.mockReturnValue({
      createCheckout: vi.fn().mockRejectedValue(new Error('stripe down')),
    } as unknown as ReturnType<typeof getProvider>)

    const res = await POST(makeReq({ provider: 'stripe', plan: 'monthly' }))

    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('provider_error')
  })

  it('returns 502 provider_error when createCheckout returns no url', async () => {
    getProviderMock.mockReturnValue({
      createCheckout: vi.fn().mockResolvedValue({ providerCustomerId: 'cus_x' }),
    } as unknown as ReturnType<typeof getProvider>)

    const res = await POST(makeReq({ provider: 'dodopayments', plan: 'monthly' }))

    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('provider_error')
  })

  it('returns 502 provider_error when createCheckout exceeds the 15s timeout', async () => {
    vi.useFakeTimers()
    getProviderMock.mockReturnValue({
      // Never settles — only the route's internal timeout can resolve the race.
      createCheckout: vi.fn().mockReturnValue(new Promise(() => {})),
    } as unknown as ReturnType<typeof getProvider>)

    const pending = POST(makeReq({ provider: 'stripe', plan: 'monthly' }))
    // Flush the pre-checkout awaits, then trip the 15s timeout.
    await vi.advanceTimersByTimeAsync(15_001)
    const res = await pending

    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('provider_error')
  })
})

// ─── Happy path anchor (5.9) ─────────────────────────────────────────────────────

describe('checkout — success', () => {
  it('returns 200 with the hosted checkout url when all guards pass', async () => {
    const res = await POST(makeReq({ provider: 'stripe', plan: 'monthly' }))

    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe(`${APP_URL}/checkout/session`)
  })
})
