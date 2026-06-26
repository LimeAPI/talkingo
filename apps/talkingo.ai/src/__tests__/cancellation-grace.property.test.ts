/**
 * Property Test — Property 10: Cancellation grace
 *
 * Feature: unified-payment-experience, Task 13.4
 * **Validates: Requirements 11.8**
 *
 * Requirement 11.8: WHILE a subscription has `cancelAtPeriodEnd === true` and
 * the current time is before the period end, the system continues to grant the
 * subscriber full access to subscription features.
 *
 * Canonical access rule (see `hasActiveAccess` in use-subscription.ts):
 *   access ⟺ status ∈ {active, trialing}
 *            ∧ (¬cancelAtPeriodEnd ∨ now < periodEnd)
 *
 * Strategy:
 *   We exercise the real `hasActiveAccess` predicate with fast-check generated
 *   subscription snapshots.
 *     - Cancelled-but-not-expired: status active/trialing, cancelAtPeriodEnd
 *       true, periodEnd strictly greater than now → access MUST be granted.
 *     - Expired-after-period (boundary): now >= periodEnd with a terminal
 *       status (canceled/expired) → access MUST NOT be granted. We also assert
 *       the boundary directly for a live status whose grace window has closed.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { hasActiveAccess } from '@/lib/subscription/use-subscription'

const NOW = 1_700_000_000_000 // fixed reference "now" in epoch ms

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** A live status that, on its own, grants access. */
const liveStatusArb = fc.constantFrom<'active' | 'trialing'>('active', 'trialing')

/** Terminal statuses a subscription transitions to once the period has ended. */
const terminalStatusArb = fc.constantFrom<'canceled' | 'expired'>('canceled', 'expired')

/** A future offset (1ms .. ~365 days) so periodEnd is strictly after now. */
const futureMsArb = fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 })

/** A non-positive offset (0 .. ~365 days in the past) so periodEnd <= now. */
const pastOrNowMsArb = fc.integer({ min: 0, max: 365 * 24 * 60 * 60 * 1000 })

// ─── Property 10: Cancellation grace ───────────────────────────────────────────

describe('Property 10: Cancellation grace', () => {
  it('grants access to cancelled-but-not-expired subscriptions (cancelAtPeriodEnd && now < periodEnd)', () => {
    /**Validates: Requirements 11.8*/
    fc.assert(
      fc.property(liveStatusArb, futureMsArb, (status, future) => {
        const info = {
          status,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: NOW + future, // strictly after now
        }
        expect(hasActiveAccess(info, NOW)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('denies access once the grace window has closed (now >= periodEnd) for terminal statuses', () => {
    /**Validates: Requirements 11.8*/
    fc.assert(
      fc.property(terminalStatusArb, pastOrNowMsArb, fc.boolean(), (status, past, cancelAtPeriodEnd) => {
        const info = {
          status,
          cancelAtPeriodEnd,
          currentPeriodEnd: NOW - past, // at or before now
        }
        expect(hasActiveAccess(info, NOW)).toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  it('closes the grace window exactly at the boundary: a cancelling live sub loses access when now >= periodEnd', () => {
    /**Validates: Requirements 11.8*/
    fc.assert(
      fc.property(liveStatusArb, pastOrNowMsArb, (status, past) => {
        const info = {
          status,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: NOW - past, // periodEnd <= now → grace elapsed
        }
        // At/after the period end the cancellation grace no longer applies.
        expect(hasActiveAccess(info, NOW)).toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  it('grants access to live subscriptions that are not scheduled to cancel, regardless of periodEnd', () => {
    /**Validates: Requirements 11.8*/
    fc.assert(
      fc.property(
        liveStatusArb,
        fc.option(fc.integer({ min: NOW - 1e10, max: NOW + 1e10 }), { nil: undefined }),
        (status, periodEnd) => {
          const info = {
            status,
            cancelAtPeriodEnd: false,
            currentPeriodEnd: periodEnd ?? undefined,
          }
          expect(hasActiveAccess(info, NOW)).toBe(true)
        },
      ),
      { numRuns: 300 },
    )
  })
})
