/**
 * Property Test — Property 5: Ownership safety
 *
 * Feature: unified-payment-experience, Task 10.2
 * **Validates: Requirements 6.5**
 *
 * Requirement 6.5: return-from-checkout sync must grant premium ONLY to the
 * user who actually owns the checkout. The recorded owner lives on the live
 * subscription's `metadata.userId`. Premium is granted (the state is persisted
 * via `syncToAppwrite`) only when `session.userId === requester`; for every
 * other pairing the sync must throw and persist nothing.
 *
 * Strategy:
 *   We drive the real `syncFromDodoCheckout` helper (the Dodo return-sync path)
 *   with fast-check generated pairs of (recordedOwnerId, requesterId). The live
 *   subscription is always confirmed (`active`) and references a known product,
 *   so the ONLY variable that decides the outcome is ownership. To isolate that
 *   variable we mock the boundary modules:
 *     - `@/lib/dodopayments/client` dodo → `subscriptions.retrieve` returns a
 *        live subscription whose `metadata.userId` is the generated owner.
 *     - `@/lib/dodopayments/env`    products → known monthly/yearly ids so
 *        `isKnownDodoProduct` passes (tampered-price is out of scope here).
 *     - `@/lib/payments/sync`       syncToAppwrite → a spy that records whether
 *        premium was granted, without touching any real store.
 *
 *   Assertion: `syncToAppwrite` is called (premium granted) and the helper
 *   resolves to a unified snapshot IFF recordedOwnerId === requesterId;
 *   otherwise the helper throws and `syncToAppwrite` is NOT called.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fc from 'fast-check'

// ─── Hoisted mock functions (referenced inside vi.mock factories) ────────────
const { retrieveMock, syncToAppwriteMock } = vi.hoisted(() => ({
  retrieveMock: vi.fn(),
  syncToAppwriteMock: vi.fn(),
}))

// Env + products: a fully-configured Dodo with known product ids so
// `isKnownDodoProduct` passes and ownership is the only deciding factor.
vi.mock('@/lib/dodopayments/env', () => ({
  DODOPAYMENTS_ENV: {
    DODOPAYMENTS_API_KEY: 'test_api_key',
    DODOPAYMENTS_WEBHOOK_SECRET: 'test_webhook_secret',
    DODOPAYMENTS_PRODUCT_MONTHLY: 'prod_monthly',
    DODOPAYMENTS_PRODUCT_YEARLY: 'prod_yearly',
  },
  DODOPAYMENTS_PRODUCTS: { monthly: 'prod_monthly', yearly: 'prod_yearly' },
}))

// Dodo SDK client — only `subscriptions.retrieve` is exercised here.
vi.mock('@/lib/dodopayments/client', () => ({
  dodo: {
    subscriptions: {
      retrieve: (...args: unknown[]) => retrieveMock(...args),
    },
  },
}))

// Shared race-safe writer — the signal that premium was granted. Never touches
// a real store; we only assert whether/with-what it was called.
vi.mock('@/lib/payments/sync', () => ({
  syncToAppwrite: (...args: unknown[]) => syncToAppwriteMock(...args),
}))

import { syncFromDodoCheckout } from '@/lib/dodopayments/sync'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A confirmed, known-product live Dodo subscription owned by `ownerId`. */
function liveSubscriptionOwnedBy(ownerId: string) {
  return {
    subscription_id: 'sub_under_test',
    status: 'active', // confirmed → ownership is the only deciding factor
    product_id: 'prod_monthly', // known product → not tampered
    customer: { customer_id: 'cus_under_test' },
    metadata: { userId: ownerId },
    next_billing_date: '2025-01-01T00:00:00Z',
  }
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Non-empty user-id-like strings (the recorded owner and the requester). */
const userIdArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => s.trim().length > 0)

// ─── Property 5: Ownership safety ──────────────────────────────────────────────

describe('Property 5: Ownership safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grants premium (persists) only when the recorded owner equals the requester', async () => {
    /**Validates: Requirements 6.5*/
    await fc.assert(
      fc.asyncProperty(userIdArb, userIdArb, async (recordedOwnerId, requesterId) => {
        // Fresh state for each generated pair.
        retrieveMock.mockReset()
        syncToAppwriteMock.mockReset()
        retrieveMock.mockResolvedValue(liveSubscriptionOwnedBy(recordedOwnerId))

        if (recordedOwnerId === requesterId) {
          // Owner matches → premium granted: resolves to a snapshot and persists.
          const result = await syncFromDodoCheckout({
            userId: requesterId,
            sessionId: 'sub_under_test',
          })

          expect(result).not.toBeNull()
          expect(result!.provider).toBe('dodopayments')
          expect(result!.status).toBe('active')
          expect(syncToAppwriteMock).toHaveBeenCalledTimes(1)
          expect(syncToAppwriteMock).toHaveBeenCalledWith(
            requesterId,
            expect.objectContaining({ provider: 'dodopayments', status: 'active' }),
          )
        } else {
          // Owner mismatch → throws and grants nothing.
          await expect(
            syncFromDodoCheckout({ userId: requesterId, sessionId: 'sub_under_test' }),
          ).rejects.toThrow(/belong/i)

          expect(syncToAppwriteMock).not.toHaveBeenCalled()
        }
      }),
      { numRuns: 300 },
    )
  })

  it('grants premium for an explicitly distinct owner/requester collision check', async () => {
    /**Validates: Requirements 6.5*/
    // A focused, deterministic example complementing the generated cases: the
    // same string used for both owner and requester must always grant premium.
    await fc.assert(
      fc.asyncProperty(userIdArb, async (id) => {
        retrieveMock.mockReset()
        syncToAppwriteMock.mockReset()
        retrieveMock.mockResolvedValue(liveSubscriptionOwnedBy(id))

        const result = await syncFromDodoCheckout({ userId: id, sessionId: 'sub_under_test' })

        expect(result).not.toBeNull()
        expect(syncToAppwriteMock).toHaveBeenCalledTimes(1)
      }),
      { numRuns: 100 },
    )
  })
})
