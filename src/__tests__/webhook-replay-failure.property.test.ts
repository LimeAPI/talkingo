/**
 * Property Test — A failed replay leaves the entry unresolved
 *
 * Feature: admin-payment-operations, Property 22:
 *   "A failed replay leaves the entry unresolved."
 *
 * **Validates: Requirements 5.3**
 *
 * For any stored dead-letter payload whose apply path fails, the dead-letter
 * entry's `resolved` field MUST remain `false` and the replay result MUST report
 * failure with an error message — the entry is NEVER marked resolved on a failed
 * replay. This mirrors `POST /api/webhook/replay`: it calls `replayDeadLetter`,
 * marks the entry `resolved = true` ONLY when that resolves, and on any throw
 * leaves `resolved = false` and returns `{ success: false, error }`.
 *
 * We exercise the production `replayDeadLetter` against in-memory injected deps
 * (NO module mocking, NO live network) across three generated failure modes:
 *   1. malformed       — an unparseable stored body (`JSON.parse` throws in the
 *                        provider's `parseWebhookForReplay`).
 *   2. unattributable  — a well-formed subscription event with no resolvable user
 *                        (no `metadata.userId` and a customer id absent from the
 *                        store), so the shared `applyEvent` throws.
 *   3. syncThrows      — a well-formed, resolvable event whose persistence step
 *                        (`syncToAppwrite`) throws, so the apply step fails.
 *
 * In every case we assert the modelled DLQ doc's `resolved` stays `false` and the
 * flow reports `{ success: false, error }`. Generated bodies stay within the
 * dead-letter 2000-char storage bound.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  replayDeadLetter,
  type WebhookHandlerDeps,
} from '@/lib/payments/webhook-handler'
import { syncToAppwrite, type SyncDeps } from '@/lib/payments/sync'
import { dodoProvider } from '@/lib/payments/dodo-provider'
import type { SubscriptionDoc, SubscriptionEventEntry } from '@/lib/appwrite-server'

// ─── Modelled dead-letter doc (the DLQ row the route loads + may resolve) ──────
interface FakeDeadLetterDoc {
  $id: string
  eventId: string
  eventType: string
  rawBody: string
  resolved: boolean
}

// ─── In-memory deps (built via injection, no module mocking) ───────────────────
/**
 * Faithful in-memory stand-in for the Appwrite operations the apply path depends
 * on. When `syncThrows` is set, the persistence writer throws — modelling a
 * failing apply step. The store starts EMPTY, so a customer-id lookup never
 * resolves a user (used by the `unattributable` mode).
 */
function makeFakeDeps(opts: { syncThrows?: boolean } = {}): WebhookHandlerDeps {
  const records = new Map<string, SubscriptionDoc>()
  const claimed = new Set<string>()
  const events: SubscriptionEventEntry[] = []
  const prefs: Record<string, unknown> = {}

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

  return {
    claimWebhookEvent: async (eventId) => {
      if (claimed.has(eventId)) return false
      claimed.add(eventId)
      return true
    },
    logDeadLetterEvent: async () => true,
    syncToAppwrite: (userId, unified) => {
      if (opts.syncThrows) {
        throw new Error('persistence_failed: simulated syncToAppwrite failure')
      }
      return syncToAppwrite(userId, unified, syncDeps)
    },
    getSubscription: syncDeps.getSubscription,
    // Empty store → every customer-id lookup misses (drives `unattributable`).
    getSubscriptionByCustomerId: async () => null,
    getSubscriptionByDodoCustomerId: async () => null,
  }
}

/**
 * Mirror of the route's success/failure handling: replay through the canonical
 * apply path, mark the entry resolved ONLY when the apply resolves, and on any
 * throw leave it unresolved and report the failure (Req 5.2 / 5.3).
 */
async function runReplayFlow(
  entry: FakeDeadLetterDoc,
  deps: WebhookHandlerDeps,
): Promise<{ success: boolean; error?: string }> {
  try {
    await replayDeadLetter(dodoProvider, entry.rawBody ?? '', deps)
    entry.resolved = true // markDeadLetterResolved — success branch only
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Replay failed'
    return { success: false, error: message }
  }
}

// ─── Arbitraries (generators) ──────────────────────────────────────────────────
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

const dodoTypeArb = fc.constantFrom(
  'subscription.active',
  'subscription.renewed',
  'subscription.cancelled',
  'subscription.on_hold',
  'subscription.expired',
  'payment.succeeded',
)

const eventDateArb = fc.date({
  min: new Date('2021-01-01T00:00:00.000Z'),
  max: new Date('2099-01-01T00:00:00.000Z'),
  noInvalidDate: true,
})

/** Build a well-formed, subscription-carrying Dodo body (status present → a
 * `subscription` snapshot is normalized). `userId` is omitted for the
 * unattributable mode. */
function buildBody(p: {
  userId?: string
  customerId: string
  subscriptionId: string
  status: string
  type: string
  eventDate: Date
}): string {
  const payload = {
    type: p.type,
    timestamp: p.eventDate.toISOString(),
    data: {
      subscription_id: p.subscriptionId,
      status: p.status,
      customer: { customer_id: p.customerId },
      ...(p.userId ? { metadata: { userId: p.userId } } : {}),
    },
  }
  return JSON.stringify(payload)
}

type Scenario = { kind: 'malformed' | 'unattributable' | 'syncThrows'; rawBody: string }

/** An unparseable stored body — `JSON.parse` throws in `parseWebhookForReplay`. */
const malformedArb: fc.Arbitrary<Scenario> = fc
  .string({ maxLength: 200 })
  .filter((s) => {
    try {
      JSON.parse(s)
      return false
    } catch {
      return true
    }
  })
  .map((rawBody) => ({ kind: 'malformed' as const, rawBody }))

/** A well-formed subscription event with no resolvable user. */
const unattributableArb: fc.Arbitrary<Scenario> = fc
  .record({
    customerId: nonEmptyIdArb,
    subscriptionId: nonEmptyIdArb,
    status: dodoStatusArb,
    type: dodoTypeArb,
    eventDate: eventDateArb,
  })
  .map((p) => ({ kind: 'unattributable' as const, rawBody: buildBody(p) }))

/** A well-formed, resolvable event whose persistence step will throw. */
const syncThrowsArb: fc.Arbitrary<Scenario> = fc
  .record({
    userId: nonEmptyIdArb,
    customerId: nonEmptyIdArb,
    subscriptionId: nonEmptyIdArb,
    status: dodoStatusArb,
    type: dodoTypeArb,
    eventDate: eventDateArb,
  })
  .map((p) => ({ kind: 'syncThrows' as const, rawBody: buildBody(p) }))

const scenarioArb = fc.oneof(malformedArb, unattributableArb, syncThrowsArb)

// ─── Property 22: A failed replay leaves the entry unresolved ────────────────────
describe('Property 22: A failed replay leaves the entry unresolved', () => {
  it('leaves resolved=false and reports failure across every apply-failure mode', async () => {
    /**Validates: Requirements 5.3*/
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        // Stay within the dead-letter storage bound.
        expect(scenario.rawBody.length).toBeLessThanOrEqual(2000)

        const entry: FakeDeadLetterDoc = {
          $id: 'dl_1',
          eventId: 'dodopayments:evt_1',
          eventType: 'subscription.active',
          rawBody: scenario.rawBody,
          resolved: false,
        }
        const deps = makeFakeDeps({ syncThrows: scenario.kind === 'syncThrows' })

        const result = await runReplayFlow(entry, deps)

        // The apply path failed → the entry is NEVER marked resolved (Req 5.3)...
        expect(entry.resolved).toBe(false)
        // ...and the flow reports failure with a non-empty error naming it.
        expect(result.success).toBe(false)
        expect(typeof result.error).toBe('string')
        expect((result.error ?? '').length).toBeGreaterThan(0)
      }),
      { numRuns: 200 },
    )
  })
})
