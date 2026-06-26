/**
 * Property Test — Property 1: No double-charge
 *
 * Feature: unified-payment-experience, Task 9.2
 * **Validates: Requirements 5.6**
 *
 * Requirement 5.6: a checkout request from a user who already holds a live
 * subscription must be rejected with 409 `already_subscribed`. A subscription
 * is "live" when its status is `active` or `trialing` AND it is not scheduled
 * to cancel at period end (`cancelAtPeriodEnd === false`). In every other case
 * (any other status, or a live status that is already cancelling) the
 * double-charge guard must let the request proceed past the double-sub check.
 *
 * Strategy:
 *   We drive the real `POST /api/billing/checkout` handler with fast-check
 *   generated *stored subscription states* — every `UnifiedStatus` value paired
 *   with both `cancelAtPeriodEnd` booleans (plus a "no subscription" case). To
 *   isolate the double-charge guard from its collaborators we mock:
 *     - `@/lib/api/auth-guard` verifyAuth → a fixed valid auth context
 *     - `@/lib/payments/guards`   originGuard/rateLimitGuard → pass (return null)
 *     - `@/lib/appwrite-server`   getSubscription → the generated stored state
 *     - `@/lib/payments/registry` getProvider → a stub whose createCheckout
 *                                                 resolves a checkout url
 *   so any request that clears the guard resolves to 200 `{ url }`.
 *
 *   Assertion: the handler returns 409 iff the stored subscription has a status
 *   in {active, trialing} AND cancelAtPeriodEnd === false; otherwise it returns
 *   200 (the guard passed and checkout was created).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as fc from 'fast-check'
import type { UnifiedStatus } from '@/lib/payments/provider'

// ─── Mocks: isolate the double-charge guard ──────────────────────────────────

// The current stored subscription state under test. Mutated per fast-check run
// and read by the mocked `getSubscription`.
let currentStored: { status: string; cancelAtPeriodEnd: boolean } | null = null

vi.mock('@/lib/api/auth-guard', () => ({
  // Always authenticated — auth (401) is out of scope for this property.
  verifyAuth: vi.fn(async () => ({ userId: 'user-under-test', jwt: 'valid-jwt' })),
}))

vi.mock('@/lib/payments/guards', () => ({
  // Both mutating-route guards pass so we exercise only the double-sub check.
  originGuard: vi.fn(() => null),
  rateLimitGuard: vi.fn(() => null),
}))

vi.mock('@/lib/appwrite-server', () => ({
  // Return the generated stored subscription state for the current run.
  getSubscription: vi.fn(async () => currentStored),
}))

vi.mock('@/lib/payments/registry', () => ({
  // A stub provider whose createCheckout always yields a url, so any request
  // that clears the double-sub guard resolves to 200.
  getProvider: vi.fn(() => ({
    id: 'stripe',
    createCheckout: vi.fn(async () => ({
      url: 'https://checkout.example.com/session_123',
      providerCustomerId: 'cus_123',
    })),
  })),
}))

import { POST } from '@/app/api/billing/checkout/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const APP_URL = 'https://app.talkingo.ai'

/** Build a checkout POST request with a valid origin + JSON body. */
function makeCheckoutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`${APP_URL}/api/billing/checkout`, {
    method: 'POST',
    headers: {
      origin: APP_URL,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const ALL_STATUSES: UnifiedStatus[] = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
  'incomplete',
  'unpaid',
]

/** The exact rule from Req 5.6: a live, non-cancelling subscription blocks. */
function shouldBlock(stored: { status: string; cancelAtPeriodEnd: boolean } | null): boolean {
  if (!stored) return false
  return (
    (stored.status === 'active' || stored.status === 'trialing') &&
    !stored.cancelAtPeriodEnd
  )
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const statusArb = fc.constantFrom<UnifiedStatus>(...ALL_STATUSES)
const planArb = fc.constantFrom('trial', 'monthly', 'yearly')

/** A stored subscription state, or `null` for the "never subscribed" case. */
const storedArb = fc.option(
  fc.record({
    status: statusArb,
    cancelAtPeriodEnd: fc.boolean(),
  }),
  { nil: null },
)

// ─── Property 1: No double-charge ─────────────────────────────────────────────

describe('Property 1: No double-charge', () => {
  beforeEach(() => {
    currentStored = null
  })

  it('returns 409 exactly when the stored subscription is live (active|trialing) and not cancelling', async () => {
    /**Validates: Requirements 5.6*/
    await fc.assert(
      fc.asyncProperty(storedArb, planArb, async (stored, plan) => {
        currentStored = stored

        const req = makeCheckoutRequest({ provider: 'stripe', plan })
        const res = await POST(req)

        if (shouldBlock(stored)) {
          // A live, non-cancelling subscription → rejected with 409.
          expect(res.status).toBe(409)
          const json = (await res.json()) as { error?: string }
          expect(json.error).toBe('already_subscribed')
        } else {
          // Otherwise the guard passes and checkout is created → 200 { url }.
          expect(res.status).toBe(200)
          const json = (await res.json()) as { url?: string }
          expect(typeof json.url).toBe('string')
          expect(json.url!.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 300 },
    )
  })
})
