/**
 * Property Test — Replaying a stored payload applies the same state as a live delivery
 *
 * Feature: admin-payment-operations, Property 21:
 *   "Replaying a stored payload applies the same state as a live delivery."
 *
 * **Validates: Requirements 5.1**
 *
 * For any dead-letter `rawBody` that normalizes to a known provider event carrying
 * a resolvable user, replaying it through the Main App MUST apply the SAME persisted
 * subscription state that a LIVE delivery of that event would produce. The replay
 * path (`replayDeadLetter`) and the live path (`handleWebhook` → `applyEvent`) both
 * funnel through the single shared `applyEvent` branch, so a replay can never drift
 * from a live delivery.
 *
 * We exercise the PRODUCTION code against two independent in-memory dependency sets
 * seeded identically (NO module mocking, NO live network):
 *   - LIVE:   `handleWebhook(provider, rawBody, sig, headers, liveDeps)` — the full
 *             canonical entry path (claim → apply within the response budget).
 *   - REPLAY: `replayDeadLetter(provider, rawBody, replayDeps)` — the trusted,
 *             signature-free internal path.
 *
 * To compare the two apply paths without forging a provider signature, we drive the
 * live path through a thin wrapper provider whose `verifyWebhook` delegates to the
 * SAME normalization the replay path uses (`parseWebhookForReplay` →
 * `normalizeDodoPayload`). Both paths therefore normalize the identical rawBody into
 * the identical `NormalizedEvent` and then run the identical shared `applyEvent`.
 *
 * For every generated payload we assert the resulting Appwrite state is identical:
 *   1. the persisted `subscriptions` store (the `syncToAppwrite` result) matches, and
 *   2. the recorded `syncToAppwrite` calls and logged subscription events match —
 *      i.e. replay performs the same `syncToAppwrite` / `applyStatusTransition`
 *      writes a live delivery performs.
 *
 * Generators only produce attributable events (a `metadata.userId`), so neither path
 * errors, and every body stays within the dead-letter 2000-char storage bound.
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

// ─── In-memory deps + an inspectable state snapshot ────────────────────────────
/**
 * A faithful in-memory stand-in for the Appwrite operations the apply path
 * depends on, plus a `snapshot()` that exposes the resulting persisted state and
 * a log of the `syncToAppwrite` calls performed (so two paths can be compared).
 * The store starts EMPTY and the real race-safe `syncToAppwrite` runs over it.
 */
interface Harness {
  deps: WebhookHandlerDeps
  snapshot: () => {
    records: Array<[string, SubscriptionDoc]>
    events: SubscriptionEventEntry[]
    syncCalls: Array<{ userId: string; status: string; plan: string; updatedAt: number }>
  }
}

function makeHarness(): Harness {
  const records = new Map<string, SubscriptionDoc>()
  const claimed = new Set<string>()
  const events: SubscriptionEventEntry[] = []
  const prefs: Record<string, unknown> = {}
  const syncCalls: Array<{ userId: string; status: string; plan: string; updatedAt: number }> = []

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

  const deps: WebhookHandlerDeps = {
    claimWebhookEvent: async (eventId) => {
      if (claimed.has(eventId)) return false
      claimed.add(eventId)
      return true
    },
    logDeadLetterEvent: async () => true,
    syncToAppwrite: (userId, unified) => {
      syncCalls.push({
        userId,
        status: unified.status,
        plan: unified.plan,
        updatedAt: unified.updatedAt,
      })
      return syncToAppwrite(userId, unified, syncDeps)
    },
    getSubscription: syncDeps.getSubscription,
    getSubscriptionByCustomerId: async () => null,
    getSubscriptionByDodoCustomerId: async () => null,
  }

  return {
    deps,
    snapshot: () => ({
      records: [...records.entries()].sort(([a], [b]) => a.localeCompare(b)),
      events: [...events],
      syncCalls: [...syncCalls],
    }),
  }
}

/**
 * Live-delivery provider: identical to the real Dodo provider EXCEPT
 * `verifyWebhook` delegates to the SAME normalization the replay path uses
 * (`parseWebhookForReplay`). This lets the full `handleWebhook` entry path run on
 * a stored body without a forged signature, while guaranteeing both paths
 * normalize the identical event and run the identical shared `applyEvent`.
 */
const liveDeliveryProvider: PaymentProvider = {
  ...dodoProvider,
  async verifyWebhook(rawBody: string) {
    return dodoProvider.parseWebhookForReplay!(rawBody)
  },
}

// ─── Arbitraries (generators) ───────────────────────────────────────────────────
const nonEmptyIdArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => s.trim().length > 0)

const dodoStatusArb = fc.constantFrom(
  'active',
  'renewed',
  'trialing',
  'on_hold',
  'past_due',
  'cancelled',
  'expired',
)

const eventDateArb = fc.date({
  min: new Date('2021-01-01T00:00:00.000Z'),
  max: new Date('2099-01-01T00:00:00.000Z'),
  noInvalidDate: true,
})

/**
 * A well-formed, subscription-carrying Dodo body. A `status` is present so
 * `normalizeDodoPayload` builds a `subscription` snapshot, and `metadata.userId`
 * is present so the event is always attributable (`applyEvent` → `syncToAppwrite`).
 */
const subscriptionEventArb = fc
  .record({
    userId: nonEmptyIdArb,
    customerId: nonEmptyIdArb,
    subscriptionId: nonEmptyIdArb,
    status: dodoStatusArb,
    type: fc.constantFrom(
      'subscription.active',
      'subscription.renewed',
      'subscription.cancelled',
      'subscription.on_hold',
      'subscription.expired',
    ),
    eventDate: eventDateArb,
  })
  .map((p) =>
    JSON.stringify({
      type: p.type,
      timestamp: p.eventDate.toISOString(),
      data: {
        subscription_id: p.subscriptionId,
        status: p.status,
        customer: { customer_id: p.customerId },
        metadata: { userId: p.userId },
      },
    }),
  )

/**
 * A status-transition Dodo body: NO `status` field (so no subscription snapshot
 * is built and `applyEvent` flows through `applyStatusTransition`), a recognized
 * transition `type`, and a `customer_id` + `metadata.userId` so the transition is
 * attributable and anchored to a customer id.
 */
const statusTransitionArb = fc
  .record({
    userId: nonEmptyIdArb,
    customerId: nonEmptyIdArb,
    type: fc.constantFrom(
      'subscription.cancelled',
      'subscription.on_hold',
      'subscription.expired',
      'payment.failed',
    ),
    eventDate: eventDateArb,
  })
  .map((p) =>
    JSON.stringify({
      type: p.type,
      timestamp: p.eventDate.toISOString(),
      data: {
        customer: { customer_id: p.customerId },
        metadata: { userId: p.userId },
      },
    }),
  )

const rawBodyArb = fc.oneof(subscriptionEventArb, statusTransitionArb)

// ─── Property 21: Replay parity with live delivery ───────────────────────────────
describe('Property 21: Replaying a stored payload applies the same state as a live delivery', () => {
  it('produces identical persisted state and the same sync writes via live and replay paths', async () => {
    /**Validates: Requirements 5.1*/
    await fc.assert(
      fc.asyncProperty(rawBodyArb, async (rawBody) => {
        // Stay within the dead-letter storage bound.
        expect(rawBody.length).toBeLessThanOrEqual(2000)

        const live = makeHarness()
        const replay = makeHarness()

        // LIVE delivery: the full canonical webhook entry path.
        const res = await handleWebhook(
          liveDeliveryProvider,
          rawBody,
          'sig',
          new Headers(),
          live.deps,
        )
        // A live delivery of an attributable event is applied (never dead-lettered).
        await expect(res.json()).resolves.toEqual({ received: true })

        // REPLAY: the trusted, signature-free internal path over the SAME body.
        await expect(
          replayDeadLetter(liveDeliveryProvider, rawBody, replay.deps),
        ).resolves.toEqual({ ok: true })

        const liveState = live.snapshot()
        const replayState = replay.snapshot()

        // Replay applies the SAME syncToAppwrite / applyStatusTransition writes...
        expect(replayState.syncCalls).toEqual(liveState.syncCalls)
        // ...the SAME logged status-change events...
        expect(replayState.events).toEqual(liveState.events)
        // ...and yields the IDENTICAL persisted subscription state (Req 5.1).
        expect(replayState.records).toEqual(liveState.records)
      }),
      { numRuns: 150 },
    )
  })
})
