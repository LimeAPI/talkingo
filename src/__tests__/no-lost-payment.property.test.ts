/**
 * Property Test — No lost payment
 *
 * Feature: unified-payment-experience, Property 3: No lost payment
 * **Validates: Requirements 6.6, 6.11**
 *
 * The "never lose a payment" guarantee: once a payment is confirmed (the
 * resulting subscription is `active` or `trialing`), the user ends up premium
 * regardless of WHICH channel observed it and in WHAT order the observations
 * arrived. A confirmed observation of the same subscription can reach Appwrite
 * via:
 *   (a) return-from-checkout sync only,
 *   (b) the provider webhook only,
 *   (c) both, in either order (and possibly duplicated / reordered), or
 *   (d) neither at first — then a later scheduled reconcile observation.
 *
 * Every channel writes through the one shared `syncToAppwrite` writer, so the
 * guarantee reduces to: applying the same confirmed observation through one or
 * more channels is idempotent — it leaves the single stored subscription in
 * `active`/`trialing` (premium granted, Req 6.6) and creates exactly ONE
 * subscription record, never duplicates (Req 6.11).
 *
 * Uses Vitest + fast-check. `syncToAppwrite` takes injectable `SyncDeps`, so we
 * drive it against an in-memory fake store (NO Appwrite module mocking). The
 * fake store keys records by `userId` exactly as the real upsert does, so the
 * record count it reports is a faithful measure of "how many subscription
 * documents exist".
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { SubscriptionDoc, SubscriptionEventEntry } from '@/lib/appwrite-server'
import { syncToAppwrite, type SyncDeps } from '@/lib/payments/sync'
import type { ProviderId, UnifiedSubscription } from '@/lib/payments/provider'

const USER_ID = 'user-paying'

// ─── In-memory fake store (built via the injectable deps, no module mocking) ──

interface FakeStore {
  deps: SyncDeps
  getDoc: () => SubscriptionDoc | null
  /** Number of distinct subscription records that exist (keyed by userId). */
  recordCount: () => number
  events: SubscriptionEventEntry[]
}

/**
 * A faithful in-memory stand-in for the Appwrite operations `syncToAppwrite`
 * depends on. Records live in a Map keyed by `userId` — the same key the real
 * `upsertSubscription` uses — so writing the same subscription through multiple
 * channels can never fork into two documents unless the writer itself did
 * something wrong. `map.size` is therefore a real "duplicate records" probe.
 */
function makeFakeStore(): FakeStore {
  const records = new Map<string, SubscriptionDoc>()
  const events: SubscriptionEventEntry[] = []
  const prefs: Record<string, unknown> = {}

  const deps: SyncDeps = {
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
    deps,
    getDoc: () => {
      const doc = records.get(USER_ID)
      return doc ? { ...doc } : null
    },
    recordCount: () => records.size,
    events,
  }
}

// ─── Arbitraries (generators) ─────────────────────────────────────────────────

const providerIdArb = fc.constantFrom<ProviderId>('stripe', 'dodopayments')

/** A confirmed/paid status: premium MUST be granted for these. */
const confirmedStatusArb = fc.constantFrom<'active' | 'trialing'>('active', 'trialing')

const planArb = fc.constantFrom<'monthly' | 'yearly'>('monthly', 'yearly')

/** A non-empty, non-whitespace identifier string. */
const nonEmptyIdArb = fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0)

/** A valid observation timestamp: a positive, finite epoch-ms value. */
const timestampArb = fc.integer({ min: 1, max: 4_102_444_800_000 })

/** The three channels through which a confirmed observation can arrive. */
type Channel = 'returnSync' | 'webhook' | 'reconcile'

/**
 * A single confirmed observation of ONE subscription. Every channel observing
 * the same subscription shares the identity (provider + customerId +
 * subscriptionId); only the per-observation `updatedAt` and incidental content
 * may differ, modelling the fact that channels can see the subscription at
 * slightly different moments. The status is always confirmed (active/trialing).
 */
function confirmedObservationArb(
  provider: ProviderId,
  customerId: string,
  subscriptionId: string,
): fc.Arbitrary<UnifiedSubscription> {
  return fc.record({
    provider: fc.constant(provider),
    providerCustomerId: fc.constant(customerId),
    providerSubscriptionId: fc.constant(subscriptionId),
    status: confirmedStatusArb,
    plan: planArb,
    trialEnd: fc.option(timestampArb, { nil: undefined }),
    periodEnd: fc.option(timestampArb, { nil: undefined }),
    cancelAtPeriodEnd: fc.boolean(),
    updatedAt: timestampArb,
  })
}

/** An arrival: which channel produced it and the observation it carries. */
interface Arrival {
  channel: Channel
  observation: UnifiedSubscription
}

/**
 * Generate an arrival scenario for a single confirmed subscription:
 *   - pick a NON-EMPTY subset of channels that fired,
 *   - give each firing channel its own confirmed observation,
 *   - shuffle the arrival order, and
 *   - allow each arrival to be duplicated (reorder + duplicates).
 *
 * The subset choice naturally covers every required case:
 *   {returnSync}            → (a) return-sync only
 *   {webhook}               → (b) webhook only
 *   {returnSync, webhook}   → (c) both, in either order
 *   {reconcile}             → (d) neither at first, then reconcile
 *   (plus richer combinations including reconcile alongside the others)
 */
const scenarioArb = fc
  .record({
    provider: providerIdArb,
    customerId: nonEmptyIdArb,
    subscriptionId: nonEmptyIdArb,
    channels: fc.uniqueArray(fc.constantFrom<Channel>('returnSync', 'webhook', 'reconcile'), {
      minLength: 1,
      maxLength: 3,
    }),
  })
  .chain(({ provider, customerId, subscriptionId, channels }) =>
    fc
      .tuple(...channels.map((ch) => confirmedObservationArb(provider, customerId, subscriptionId).map((observation) => ({ channel: ch, observation }))))
      .chain((arrivals: Arrival[]) =>
        fc
          .record({
            order: fc.shuffledSubarray(
              arrivals.map((_, i) => i),
              { minLength: arrivals.length, maxLength: arrivals.length },
            ),
            repeats: fc.array(fc.integer({ min: 1, max: 3 }), {
              minLength: arrivals.length,
              maxLength: arrivals.length,
            }),
          })
          .map(({ order, repeats }) => {
            const sequence: Arrival[] = []
            for (const idx of order) {
              for (let k = 0; k < repeats[idx]; k++) sequence.push(arrivals[idx])
            }
            return { channels, sequence }
          }),
      ),
  )

// ─── Property 3: No lost payment ──────────────────────────────────────────────

describe('Property 3: No lost payment', () => {
  it('a confirmed payment lands the user in active/trialing with exactly one record, regardless of channel/order', async () => {
    /**Validates: Requirements 6.6, 6.11*/
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ sequence }) => {
        const store = makeFakeStore()

        for (const { observation } of sequence) {
          await syncToAppwrite(USER_ID, observation, store.deps)
        }

        const doc = store.getDoc()

        // Req 6.6: a confirmed payment grants premium — the stored subscription
        // is in a premium-granting status no matter which channel/order won.
        expect(doc).not.toBeNull()
        expect(['active', 'trialing']).toContain(doc!.status)

        // Req 6.11: no duplicate records — applying the same confirmed
        // observation through multiple channels stays a single document.
        expect(store.recordCount()).toBe(1)
      }),
      { numRuns: 400 },
    )
  })

  it('neither-then-reconcile: a reconcile-sourced confirmed observation still grants premium', async () => {
    /**Validates: Requirements 6.6, 6.11*/
    await fc.assert(
      fc.asyncProperty(
        providerIdArb,
        nonEmptyIdArb,
        nonEmptyIdArb,
        confirmedStatusArb,
        planArb,
        timestampArb,
        async (provider, customerId, subscriptionId, status, plan, updatedAt) => {
          const store = makeFakeStore()

          // (d) Neither return-sync nor webhook ran — nothing is stored yet.
          expect(store.getDoc()).toBeNull()
          expect(store.recordCount()).toBe(0)

          // A later reconcile observes the confirmed subscription and writes it.
          const reconcileObservation: UnifiedSubscription = {
            provider,
            providerCustomerId: customerId,
            providerSubscriptionId: subscriptionId,
            status,
            plan,
            cancelAtPeriodEnd: false,
            updatedAt,
          }
          await syncToAppwrite(USER_ID, reconcileObservation, store.deps)

          const doc = store.getDoc()
          expect(doc).not.toBeNull()
          expect(['active', 'trialing']).toContain(doc!.status)
          expect(store.recordCount()).toBe(1)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('return-sync and webhook in BOTH orders converge to one premium record', async () => {
    /**Validates: Requirements 6.6, 6.11*/
    await fc.assert(
      fc.asyncProperty(
        providerIdArb,
        nonEmptyIdArb,
        nonEmptyIdArb,
        confirmedStatusArb,
        confirmedStatusArb,
        planArb,
        fc.integer({ min: 1, max: 2_000_000_000_000 }),
        fc.integer({ min: 2_000_000_001_000, max: 4_102_444_800_000 }),
        async (provider, customerId, subscriptionId, statusA, statusB, plan, tsEarly, tsLate) => {
          const returnSyncObs: UnifiedSubscription = {
            provider,
            providerCustomerId: customerId,
            providerSubscriptionId: subscriptionId,
            status: statusA,
            plan,
            cancelAtPeriodEnd: false,
            updatedAt: tsEarly,
          }
          const webhookObs: UnifiedSubscription = {
            provider,
            providerCustomerId: customerId,
            providerSubscriptionId: subscriptionId,
            status: statusB,
            plan,
            cancelAtPeriodEnd: false,
            updatedAt: tsLate,
          }

          // Order 1: return-sync first, then webhook.
          const store1 = makeFakeStore()
          await syncToAppwrite(USER_ID, returnSyncObs, store1.deps)
          await syncToAppwrite(USER_ID, webhookObs, store1.deps)

          // Order 2: webhook first, then return-sync.
          const store2 = makeFakeStore()
          await syncToAppwrite(USER_ID, webhookObs, store2.deps)
          await syncToAppwrite(USER_ID, returnSyncObs, store2.deps)

          for (const store of [store1, store2]) {
            const doc = store.getDoc()
            expect(doc).not.toBeNull()
            expect(['active', 'trialing']).toContain(doc!.status)
            expect(store.recordCount()).toBe(1)
          }

          // Both orders converge on the newest-by-updatedAt observation.
          expect(store1.getDoc()!.status).toBe(statusB)
          expect(store2.getDoc()!.status).toBe(statusB)
          expect(store1.getDoc()!.updatedAt).toBe(tsLate)
          expect(store2.getDoc()!.updatedAt).toBe(tsLate)
        },
      ),
      { numRuns: 300 },
    )
  })
})
