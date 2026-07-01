/**
 * Property Test — Replay parity with live delivery
 *
 * Feature: admin-payment-operations, Property 21:
 *   "Replaying a stored payload applies the same state as a live delivery."
 *
 * **Validates: Requirements 5.1**
 *
 * For any dead-letter `rawBody` that parses to a known provider event carrying a
 * resolvable user, replaying it through `replayDeadLetter` applies the SAME
 * persisted subscription state that a LIVE delivery of that event (through the
 * canonical `handleWebhook` → `applyEvent` path) would produce.
 *
 * We drive BOTH paths with the production code and the real Dodo provider
 * normalization (`dodoProvider.parseWebhookForReplay`) against two independent
 * in-memory stores, then assert the resulting subscription document is identical:
 *
 *   - LIVE  : handleWebhook(liveProvider, rawBody, …, deps) — the full live
 *             pipeline (verify → claim idempotency → applyEvent → respond). The
 *             only thing stubbed is signature verification: `verifyWebhook`
 *             delegates to the real `parseWebhookForReplay` so we feed the exact
 *             NormalizedEvent a verified live delivery yields, with no forged
 *             signature or env secrets (the replay path is, by design, the same
 *             apply branch but with signature verification bypassed).
 *   - REPLAY: replayDeadLetter(dodoProvider, rawBody, deps) — parse → applyEvent.
 *
 * Both paths share the real `applyEvent` and the real race-safe `syncToAppwrite`
 * writer (driven against an in-memory fake via injected deps — NO module mocking,
 * NO live network). Generated payloads embed a provider event time so `updatedAt`
 * is deterministic and identical across both runs, and stay well under the
 * dead-letter 2000-char storage bound so a JSON.parse on replay always succeeds.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  handleWebhook,
  replayDeadLetter,
  type WebhookHandlerDeps,
} from '@/lib/payments/webhook-handler'
import { syncToAppwrite, type SyncDeps } from '@/lib/payments/sync'
import { dodoProvider } from '@/lib/payments/dodo-provider'
import type { PaymentProvider } from '@/lib/payments/provider'
import type { SubscriptionDoc, SubscriptionEventEntry } from '@/lib/appwrite-server'

// ─── In-memory fake store (built via injected deps, no module mocking) ──────────
interface FakeStore {
  deps: WebhookHandlerDeps
  getDoc: (userId: string) => SubscriptionDoc | null
  deadLetters: Array<{ eventId: string; eventType: string; error: string }>
}

/**
 * A faithful in-memory stand-in for the Appwrite operations the webhook handler
 * depends on. Subscription records live in a Map keyed by `userId` exactly as the
 * real upsert does, so the real `syncToAppwrite` writer behaves identically here.
 */
function makeFakeStore(): FakeStore {
  const records = new Map<string, SubscriptionDoc>()
  const claimed = new Set<string>()
  const events: SubscriptionEventEntry[] = []
  const prefs: Record<string, unknown> = {}
  const deadLetters: Array<{ eventId: string; eventType: string; error: string }> = []

  const syncDeps: SyncDeps = {
    getSubscription: async (userId) => {
      const doc = records.get(userId)
      return doc ? { ...doc } : null
    },
    upsertSubscription: async (userId, fields) => {
      const prev = records.get(userId) ?? ({ userId } as SubscriptionDoc)
      records.set(userId, { ...prev, ...fields, userId })
    },
    updateUserPrefs: async (_userId, p) => {
      Object.assign(prefs, p)
    },
    logSubscriptionEvent: async (entry) => {
      events.push(entry)
    },
  }

  const findByField = (field: keyof SubscriptionDoc, value: string) => {
    for (const doc of records.values()) {
      if ((doc as unknown as Record<string, unknown>)[field] === value) return { ...doc }
    }
    return null
  }

  const deps: WebhookHandlerDeps = {
    claimWebhookEvent: async (eventId) => {
      if (claimed.has(eventId)) return false
      claimed.add(eventId)
      return true
    },
    logDeadLetterEvent: async (eventId, eventType, errorMessage) => {
      deadLetters.push({ eventId, eventType, error: errorMessage })
      return true
    },
    // Use the REAL race-safe writer, bound to this store's in-memory deps.
    syncToAppwrite: (userId, unified) => syncToAppwrite(userId, unified, syncDeps),
    getSubscription: syncDeps.getSubscription,
    getSubscriptionByCustomerId: async (customerId) =>
      findByField('providerCustomerId', customerId) ??
      findByField('stripeCustomerId', customerId),
    getSubscriptionByDodoCustomerId: async (customerId) =>
      findByField('dodopaymentsCustomerId', customerId) ??
      findByField('providerCustomerId', customerId),
  }

  return {
    deps,
    getDoc: (userId) => {
      const doc = records.get(userId)
      return doc ? { ...doc } : null
    },
    deadLetters,
  }
}

/**
 * A "live" provider: the real Dodo provider, but with signature verification
 * bypassed so `verifyWebhook` yields the exact same NormalizedEvent the replay
 * parser produces — modelling a verified live delivery without a forged signature.
 */
const liveProvider: PaymentProvider = {
  ...dodoProvider,
  verifyWebhook: (rawBody) => dodoProvider.parseWebhookForReplay!(rawBody),
}

// ─── Arbitraries (generators) ───────────────────────────────────────────────────
const nonEmptyIdArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => s.trim().length > 0)

/** Raw Dodo statuses spanning every UnifiedStatus bucket. */
const dodoStatusArb = fc.constantFrom(
  'active',
  'renewed',
  'succeeded',
  'paid',
  'trialing',
  'trial',
  'on_hold',
  'past_due',
  'failed',
  'unpaid',
  'cancelled',
  'canceled',
  'expired',
  'pending',
)

const dodoTypeArb = fc.constantFrom(
  'subscription.active',
  'subscription.renewed',
  'subscription.cancelled',
  'subscription.on_hold',
  'subscription.expired',
  'payment.succeeded',
)

/** A valid provider event time, embedded in the payload so both paths agree. */
const eventDateArb = fc.date({
  min: new Date('2021-01-01T00:00:00.000Z'),
  max: new Date('2099-01-01T00:00:00.000Z'),
  noInvalidDate: true,
})

/** A subscription-carrying Dodo webhook payload with a resolvable user. */
const payloadArb = fc.record({
  userId: nonEmptyIdArb,
  customerId: nonEmptyIdArb,
  subscriptionId: nonEmptyIdArb,
  status: dodoStatusArb,
  type: dodoTypeArb,
  eventDate: eventDateArb,
  periodEnd: fc.option(eventDateArb, { nil: undefined }),
  cancelAtNextBilling: fc.boolean(),
})

function buildRawBody(p: {
  userId: string
  customerId: string
  subscriptionId: string
  status: string
  type: string
  eventDate: Date
  periodEnd?: Date
  cancelAtNextBilling: boolean
}): string {
  const payload = {
    type: p.type,
    timestamp: p.eventDate.toISOString(),
    data: {
      subscription_id: p.subscriptionId,
      status: p.status,
      customer: { customer_id: p.customerId },
      metadata: { userId: p.userId },
      cancel_at_next_billing_date: p.cancelAtNextBilling,
      ...(p.periodEnd ? { next_billing_date: p.periodEnd.toISOString() } : {}),
    },
  }
  return JSON.stringify(payload)
}

// ─── Property 21: Replay parity with live delivery ──────────────────────────────
describe('Property 21: Replaying a stored payload applies the same state as a live delivery', () => {
  it('replay applies the identical persisted subscription state as a live delivery', async () => {
    /**Validates: Requirements 5.1*/
    await fc.assert(
      fc.asyncProperty(payloadArb, async (p) => {
        const rawBody = buildRawBody(p)

        // Stay within the dead-letter storage bound so a replay JSON.parse succeeds.
        expect(rawBody.length).toBeLessThanOrEqual(2000)

        // LIVE delivery through the canonical handleWebhook → applyEvent path.
        const live = makeFakeStore()
        const liveRes = await handleWebhook(
          liveProvider,
          rawBody,
          null,
          new Headers(),
          live.deps,
        )

        // REPLAY of the same stored rawBody through replayDeadLetter.
        const replay = makeFakeStore()
        const replayRes = await replayDeadLetter(dodoProvider, rawBody, replay.deps)

        // Both paths must succeed and apply (never dead-letter) for a resolvable event.
        expect(liveRes.status).toBe(200)
        expect(live.deadLetters).toHaveLength(0)
        expect(replayRes).toEqual({ ok: true })

        const liveDoc = live.getDoc(p.userId)
        const replayDoc = replay.getDoc(p.userId)

        // A subscription state was persisted by both paths...
        expect(liveDoc).not.toBeNull()
        expect(replayDoc).not.toBeNull()

        // ...and it is byte-for-byte identical between live delivery and replay.
        expect(replayDoc).toEqual(liveDoc)
      }),
      { numRuns: 200 },
    )
  })
})
