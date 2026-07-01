/**
 * Property test — Property 9: Webhook id isolation.
 *
 * **Validates: Requirements 8.8**
 *
 * Webhook event ids from the two providers share a single idempotency store, so
 * they MUST be namespaced such that a Stripe event id can never collide with a
 * Dodo event id, and the Dodo id MUST be STABLE across retries (a pure function
 * of `subscriptionId + type + periodEnd`) so re-delivered events de-duplicate.
 *
 * Two properties are exercised against the *real* derivation logic:
 *
 *  1. Cross-provider non-collision — the Stripe namespaced key `stripe:${rawId}`
 *     (exactly how `StripeProvider.verifyWebhook` builds it) can never equal the
 *     Dodo namespaced key produced by the shared `deriveDodoWebhookEventId`
 *     helper (exactly how `DodoProvider.verifyWebhook` builds it).
 *
 *  2. Dodo id stability — `deriveDodoWebhookEventId` is a pure function of its
 *     inputs: computing it twice for the same `(subscriptionId, type, periodEnd)`
 *     (i.e. an event and its retry) yields an identical id.
 *
 * The Dodo derivation is imported from `@/lib/dodopayments/sync` — the same
 * exported helper the provider uses — so this test exercises the production
 * logic rather than a copy.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import {
  DODO_WEBHOOK_ID_NAMESPACE,
  deriveDodoWebhookEventId,
} from '@/lib/dodopayments/sync'

// ── Namespacing helpers (modeled exactly on the providers) ───────────────────

/** How `StripeProvider.verifyWebhook` namespaces a raw Stripe event id. */
function stripeNamespacedId(rawStripeEventId: string): string {
  return `stripe:${rawStripeEventId}`
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Raw Stripe event ids look like `evt_...`, but generate arbitrary strings too. */
const stripeRawIdArb = fc.oneof(
  fc.string(),
  fc.string().map((s) => `evt_${s}`),
)

/** A Dodo subscription id (`sub_...`) — also allow arbitrary/empty strings. */
const dodoSubscriptionIdArb = fc.oneof(
  fc.string(),
  fc.string().map((s) => `sub_${s}`),
)

/** A Dodo event type, e.g. `subscription.active`. */
const dodoTypeArb = fc.oneof(
  fc.string(),
  fc.constantFrom(
    'subscription.active',
    'subscription.renewed',
    'subscription.cancelled',
    'subscription.on_hold',
    'payment.succeeded',
    'unknown',
  ),
)

/**
 * A Dodo `periodEnd` value in the several shapes real payloads use:
 * ISO-8601 strings, epoch seconds, epoch ms, or absent (null/undefined).
 */
const dodoPeriodEndArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.integer({ min: 0, max: 4_102_444_800 }), // epoch seconds-ish
  fc.integer({ min: 1_000_000_000_000, max: 4_102_444_800_000 }), // epoch ms
  fc.date({ min: new Date('2001-01-01'), max: new Date('2100-01-01'), noInvalidDate: true }).map((d) =>
    d.toISOString(),
  ),
  fc.string(),
)

const dodoTupleArb = fc.record({
  subscriptionId: dodoSubscriptionIdArb,
  type: dodoTypeArb,
  periodEnd: dodoPeriodEndArb,
})

describe('Property 9: Webhook id isolation', () => {
  it('Stripe-namespaced and Dodo-namespaced keys never collide', () => {
    /**Validates: Requirements 8.8*/
    fc.assert(
      fc.property(stripeRawIdArb, dodoTupleArb, (stripeRawId, dodo) => {
        const stripeKey = stripeNamespacedId(stripeRawId)
        const dodoKey = deriveDodoWebhookEventId(dodo.subscriptionId, dodo.type, dodo.periodEnd)

        // The two providers live in the same idempotency store: their keys must
        // never be equal regardless of raw id content.
        expect(stripeKey).not.toBe(dodoKey)

        // And each key carries its own provider namespace prefix.
        expect(stripeKey.startsWith('stripe:')).toBe(true)
        expect(dodoKey.startsWith(`${DODO_WEBHOOK_ID_NAMESPACE}:`)).toBe(true)
      }),
      { numRuns: 500 },
    )
  })

  it('Dodo derived id is stable across retries (pure function of its inputs)', () => {
    /**Validates: Requirements 8.8*/
    fc.assert(
      fc.property(dodoTupleArb, ({ subscriptionId, type, periodEnd }) => {
        // First delivery and its retry carry identical event data → identical id.
        const first = deriveDodoWebhookEventId(subscriptionId, type, periodEnd)
        const retry = deriveDodoWebhookEventId(subscriptionId, type, periodEnd)
        expect(retry).toBe(first)
      }),
      { numRuns: 500 },
    )
  })
})
