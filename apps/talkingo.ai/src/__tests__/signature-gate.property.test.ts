/**
 * Property test — Property 6: Signature gate.
 *
 * **Validates: Requirements 8.1, 8.2**
 *
 * The webhook handler MUST verify the provider signature over the raw body
 * BEFORE doing anything that could mutate subscription state. The guarantee:
 * no state mutation occurs unless the signature verifies for that provider.
 *
 *   - Req 8.1: the handler verifies the signature (delegating to the provider's
 *     `verifyWebhook`) as its first step.
 *   - Req 8.2: when the signature does not verify (invalid) OR is missing
 *     (null) OR the secret is unconfigured, the handler returns 400 and changes
 *     NO subscription state.
 *
 * `handleWebhook(provider, rawBody, signature, headers, injectedDeps)` calls
 * `provider.verifyWebhook(...)` first; any throw short-circuits to a 400 before
 * the idempotency claim or the `syncToAppwrite` apply step run. We therefore
 * model a provider whose `verifyWebhook` returns a `NormalizedEvent` ONLY when
 * the signature equals a known-good token, and throws for every other value
 * (invalid string OR null/missing) — exactly the contract real providers honor.
 *
 * "No state mutation" is observed precisely: the injected deps are in-memory
 * spies. `claimWebhookEvent` (the idempotency claim) and `syncToAppwrite` (the
 * persistence write) are the only two gateways through which the handler can
 * change stored state, so asserting neither was called is a faithful proof that
 * no mutation happened. Both provider ids ('stripe' / 'dodopayments') are
 * parameterized so the gate is proven per provider.
 *
 * Uses Vitest + fast-check. No module mocking — the handler is driven entirely
 * through its injectable `WebhookHandlerDeps`.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import {
  handleWebhook,
  type WebhookHandlerDeps,
} from '@/lib/payments/webhook-handler'
import type {
  NormalizedEvent,
  PaymentProvider,
  ProviderId,
  UnifiedSubscription,
} from '@/lib/payments/provider'

// ── The known-good signature token (the model's "valid" signature) ───────────

const GOOD_SIGNATURE = 'valid-signature-token'

// ── Spying in-memory deps: the only two state gateways are recorded ──────────

interface SpyDeps {
  deps: WebhookHandlerDeps
  claimCalls: number
  syncCalls: number
  deadLetterCalls: number
}

/**
 * Build `WebhookHandlerDeps` whose state-changing operations are spies. If the
 * handler reaches them at all the signature gate has been breached, so each
 * call is counted. `claimWebhookEvent` returns `true` (first sight) so that, on
 * the valid path, the handler proceeds past the idempotency claim into the
 * apply step — letting us assert the gate OPENS for a good signature.
 */
function makeSpyDeps(): SpyDeps {
  const spy: SpyDeps = { deps: undefined as never, claimCalls: 0, syncCalls: 0, deadLetterCalls: 0 }

  spy.deps = {
    claimWebhookEvent: async () => {
      spy.claimCalls++
      return true
    },
    logDeadLetterEvent: async () => {
      spy.deadLetterCalls++
      return true
    },
    syncToAppwrite: (async () => {
      spy.syncCalls++
    }) as WebhookHandlerDeps['syncToAppwrite'],
    getSubscription: async () => null,
    getSubscriptionByCustomerId: async () => null,
    getSubscriptionByDodoCustomerId: async () => null,
  }

  return spy
}

// ── A stub provider whose verifyWebhook is a pure signature gate ─────────────

/**
 * Build a stub `PaymentProvider` for `providerId` whose `verifyWebhook` returns
 * a verified `NormalizedEvent` ONLY when `signature === GOOD_SIGNATURE`, and
 * THROWS otherwise (invalid string or null/missing). This mirrors how the real
 * Stripe/Dodo providers behave: a good signature yields a normalized event, a
 * bad/missing one throws. The returned event carries a subscription so that, if
 * the gate were (incorrectly) open, the handler WOULD call `syncToAppwrite`.
 */
function makeGateProvider(providerId: ProviderId): PaymentProvider {
  const subscription: UnifiedSubscription = {
    provider: providerId,
    providerCustomerId: 'cus_gate',
    providerSubscriptionId: 'sub_gate',
    status: 'active',
    plan: 'monthly',
    cancelAtPeriodEnd: false,
    updatedAt: 1_700_000_000_000,
  }

  const notImplemented = () => {
    throw new Error('not used by the signature-gate test')
  }

  return {
    id: providerId,
    isEnabled: () => true,
    verifyWebhook: async (_rawBody, signature): Promise<NormalizedEvent> => {
      if (signature !== GOOD_SIGNATURE) {
        throw new Error('signature verification failed')
      }
      return {
        id: `${providerId}:evt_gate`,
        type: 'subscription.active',
        userId: 'user-gate',
        customerId: 'cus_gate',
        subscription,
      }
    },
    createCheckout: notImplemented as PaymentProvider['createCheckout'],
    syncFromCheckout: notImplemented as PaymentProvider['syncFromCheckout'],
    getStatus: notImplemented as PaymentProvider['getStatus'],
    cancel: notImplemented as PaymentProvider['cancel'],
    reactivate: notImplemented as PaymentProvider['reactivate'],
    changePlan: notImplemented as PaymentProvider['changePlan'],
    reconcile: notImplemented as PaymentProvider['reconcile'],
    getManageUrl: notImplemented as PaymentProvider['getManageUrl'],
  }
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const providerIdArb = fc.constantFrom<ProviderId>('stripe', 'dodopayments')

/** Raw webhook body bytes — arbitrary content; the gate must not depend on it. */
const rawBodyArb = fc.string()

/**
 * An INVALID-or-MISSING signature: any value that is not the known-good token.
 * Covers arbitrary strings (invalid) and `null` (missing header). The filter
 * guards against the (astronomically unlikely) case fast-check generates the
 * good token verbatim.
 */
const badSignatureArb = fc.oneof(
  fc.constant(null),
  fc.string().filter((s) => s !== GOOD_SIGNATURE),
)

describe('Property 6: Signature gate', () => {
  it('invalid or missing signature → 400 and NO state mutation (per provider)', async () => {
    /**Validates: Requirements 8.1, 8.2*/
    await fc.assert(
      fc.asyncProperty(
        providerIdArb,
        rawBodyArb,
        badSignatureArb,
        async (providerId, rawBody, signature) => {
          const provider = makeGateProvider(providerId)
          const spy = makeSpyDeps()

          const res = await handleWebhook(
            provider,
            rawBody,
            signature,
            new Headers(),
            spy.deps,
          )

          // Req 8.2: signature did not verify → 400.
          expect(res.status).toBe(400)

          // Req 8.1 / 8.2: NO state mutation — the handler never reached the
          // idempotency claim or the persistence write.
          expect(spy.claimCalls).toBe(0)
          expect(spy.syncCalls).toBe(0)
          expect(spy.deadLetterCalls).toBe(0)
        },
      ),
      { numRuns: 400 },
    )
  })

  it('valid signature → gate opens: verification succeeds and the handler proceeds (claim called)', async () => {
    /**Validates: Requirements 8.1, 8.2*/
    await fc.assert(
      fc.asyncProperty(providerIdArb, rawBodyArb, async (providerId, rawBody) => {
        const provider = makeGateProvider(providerId)
        const spy = makeSpyDeps()

        const res = await handleWebhook(
          provider,
          rawBody,
          GOOD_SIGNATURE,
          new Headers(),
          spy.deps,
        )

        // A verified signature must NOT be rejected as a bad signature.
        expect(res.status).not.toBe(400)

        // The gate opened: the handler proceeded past verification into the
        // idempotency claim, and then (claim → true) into the apply/persist
        // step. Both prove state mutation is reachable only AFTER a valid
        // signature (the contrapositive of Req 8.2).
        expect(spy.claimCalls).toBe(1)
        expect(spy.syncCalls).toBe(1)
      }),
      { numRuns: 200 },
    )
  })
})
