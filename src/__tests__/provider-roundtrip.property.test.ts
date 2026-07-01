/**
 * Property Test — Provider round-trip
 *
 * Feature: unified-payment-experience, Property 7: Provider round-trip
 * **Validates: Requirements 13.5**
 *
 * Property 7: A subscription created via provider P is always read back as
 * provider P. ∀ sub created with P: toUnified(toDocFields(sub)).provider = P.
 *
 * Uses Vitest + fast-check. We generate `UnifiedSubscription` values for BOTH
 * providers ('stripe' and 'dodopayments') with valid non-empty
 * `providerCustomerId`, write them to document fields via `toDocFields`, then
 * read them back via `toUnified` and assert the provider is preserved.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { SubscriptionDoc } from '@/lib/appwrite-server'
import { toUnified, toDocFields } from '@/lib/payments/subscription-mapper'
import type {
  ProviderId,
  UnifiedStatus,
  UnifiedSubscription,
} from '@/lib/payments/provider'

// ─── Arbitraries (generators) ────────────────────────────────────────────────

const providerIdArb = fc.constantFrom<ProviderId>('stripe', 'dodopayments')

const unifiedStatusArb = fc.constantFrom<UnifiedStatus>(
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
  'incomplete',
  'unpaid',
)

const planArb = fc.constantFrom<'monthly' | 'yearly'>('monthly', 'yearly')

/** A non-empty, non-whitespace identifier string. */
const nonEmptyIdArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0)

/** epoch-ms-ish timestamp */
const timestampArb = fc.integer({ min: 0, max: 4_102_444_800_000 })

/**
 * Generator for a UnifiedSubscription with a valid non-empty providerCustomerId,
 * covering both providers. providerSubscriptionId is optional.
 */
const unifiedSubscriptionArb: fc.Arbitrary<UnifiedSubscription> = fc.record({
  provider: providerIdArb,
  providerCustomerId: nonEmptyIdArb,
  providerSubscriptionId: fc.option(nonEmptyIdArb, { nil: undefined }),
  status: unifiedStatusArb,
  plan: planArb,
  trialEnd: fc.option(timestampArb, { nil: undefined }),
  periodEnd: fc.option(timestampArb, { nil: undefined }),
  cancelAtPeriodEnd: fc.boolean(),
  updatedAt: timestampArb,
})

// ─── Property 7: Provider round-trip ─────────────────────────────────────────

describe('Property 7: Provider round-trip', () => {
  it('toUnified(toDocFields(s)).provider === s.provider for both providers', () => {
    /**Validates: Requirements 13.5*/
    fc.assert(
      fc.property(unifiedSubscriptionArb, (s) => {
        // WRITE then READ: round-trip through the document representation.
        const docFields = toDocFields(s)

        // toDocFields returns Partial<SubscriptionDoc>; for the round-trip it
        // carries every field toUnified reads, so we treat it as a SubscriptionDoc.
        const doc = { userId: 'user-test', ...docFields } as SubscriptionDoc

        const roundTripped = toUnified(doc)

        // A valid subscription with a non-empty customer id must round-trip.
        expect(roundTripped).not.toBeNull()
        expect(roundTripped!.provider).toBe(s.provider)
      }),
      { numRuns: 200 },
    )
  })

  it('round-trips the canonical identifiers and legacy mirrors for stripe', () => {
    /**Validates: Requirements 13.5*/
    fc.assert(
      fc.property(
        unifiedSubscriptionArb.filter((s) => s.provider === 'stripe'),
        (s) => {
          const doc = { userId: 'u', ...toDocFields(s) } as SubscriptionDoc
          // Legacy mirror is written for stripe.
          expect(doc.stripeCustomerId).toBe(s.providerCustomerId)
          const back = toUnified(doc)
          expect(back).not.toBeNull()
          expect(back!.provider).toBe('stripe')
          expect(back!.providerCustomerId).toBe(s.providerCustomerId)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('round-trips the canonical identifiers and legacy mirrors for dodopayments', () => {
    /**Validates: Requirements 13.5*/
    fc.assert(
      fc.property(
        unifiedSubscriptionArb.filter((s) => s.provider === 'dodopayments'),
        (s) => {
          const doc = { userId: 'u', ...toDocFields(s) } as SubscriptionDoc
          // Legacy mirror is written for dodopayments.
          expect(doc.dodopaymentsCustomerId).toBe(s.providerCustomerId)
          const back = toUnified(doc)
          expect(back).not.toBeNull()
          expect(back!.provider).toBe('dodopayments')
          expect(back!.providerCustomerId).toBe(s.providerCustomerId)
        },
      ),
      { numRuns: 100 },
    )
  })
})
