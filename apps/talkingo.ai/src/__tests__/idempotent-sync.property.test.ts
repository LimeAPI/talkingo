/**
 * Property Test — Idempotent sync
 *
 * Feature: unified-payment-experience, Property 2: Idempotent sync
 * **Validates: Requirements 7.8**
 *
 * Requirement 7.8: applying the same observation (identical canonical fields and
 * identical `updatedAt`) any number of times yields the same stored state, the
 * same user account preferences, and no additional status-change audit events
 * beyond those produced by applying it once.
 *
 * Strategy (see design.md → "Race-safe persistence"):
 *   We drive the real `syncToAppwrite` writer against an in-memory fake `SyncDeps`
 *   (no Appwrite modules mocked). fast-check generates a pool of observations for a
 *   single subscription with DISTINCT `updatedAt` timestamps and varying status.
 *   We then build event sequences with duplicates and reorders and assert:
 *     (a) the final stored state (and prefs) equal applying only the
 *         newest-by-`updatedAt` observation; and
 *     (b) when observations are applied in `updatedAt` order, the number of
 *         status-change audit events equals the number of distinct consecutive
 *         status changes, and re-applying identical observations adds none.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { SubscriptionDoc, SubscriptionEventEntry } from '@/lib/appwrite-server'
import type { ProviderId, UnifiedStatus, UnifiedSubscription } from '@/lib/payments/provider'
import { syncToAppwrite, type SyncDeps, type SyncOutcome } from '@/lib/payments/sync'

const USER_ID = 'user-under-test'

// ─── In-memory fake store (records audit events) ─────────────────────────────

interface FakeStore {
  deps: SyncDeps
  getDoc: () => SubscriptionDoc | null
  getPrefs: () => Record<string, unknown>
  getAudits: () => SubscriptionEventEntry[]
}

/**
 * A faithful in-memory implementation of the Appwrite operations
 * `syncToAppwrite` depends on. The doc is stored exactly as written so the
 * writer's verify-once read observes the value it just wrote (no spurious
 * retries) — exactly how a healthy datastore behaves.
 */
function makeFakeStore(): FakeStore {
  let doc: SubscriptionDoc | null = null
  const prefs: Record<string, unknown> = {}
  const audits: SubscriptionEventEntry[] = []

  const deps: SyncDeps = {
    getSubscription: async () => (doc ? { ...doc } : null),
    upsertSubscription: async (userId, fields) => {
      doc = { ...(doc ?? { userId, status: '', plan: '', updatedAt: 0 }), ...fields, userId }
    },
    updateUserPrefs: async (_userId, p) => {
      Object.assign(prefs, p)
    },
    logSubscriptionEvent: async (entry) => {
      audits.push(entry)
    },
  }

  return {
    deps,
    getDoc: () => (doc ? { ...doc } : null),
    getPrefs: () => ({ ...prefs }),
    getAudits: () => audits.slice(),
  }
}

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

const nonEmptyIdArb = fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0)

const timestampArb = fc.integer({ min: 1, max: 4_102_444_800_000 })

/** The mutable, observation-specific content (everything except identity + updatedAt). */
const obsContentArb = fc.record({
  status: unifiedStatusArb,
  plan: planArb,
  cancelAtPeriodEnd: fc.boolean(),
  trialEnd: fc.option(timestampArb, { nil: undefined }),
  periodEnd: fc.option(timestampArb, { nil: undefined }),
})

/**
 * Generate a pool of observations of a SINGLE subscription (same provider +
 * customer id) with DISTINCT `updatedAt` values. Distinct timestamps make the
 * "newest-by-updatedAt" observation unambiguous and make any duplicate a truly
 * identical observation.
 */
const observationPoolArb: fc.Arbitrary<UnifiedSubscription[]> = fc
  .record({
    provider: providerIdArb,
    customerId: nonEmptyIdArb,
    timestamps: fc.uniqueArray(timestampArb, { minLength: 1, maxLength: 8 }),
  })
  .chain(({ provider, customerId, timestamps }) =>
    fc.tuple(...timestamps.map(() => obsContentArb)).map((contents) =>
      timestamps.map(
        (ts, i): UnifiedSubscription => ({
          provider,
          providerCustomerId: customerId,
          providerSubscriptionId: `${customerId}_sub`,
          updatedAt: ts,
          ...contents[i],
        }),
      ),
    ),
  )

/**
 * From a pool, produce a sequence that REORDERS the distinct observations and
 * REPEATS each one consecutively (duplicates). The full permutation guarantees
 * every observation — including the newest — appears at least once.
 */
const reorderedWithDuplicatesArb = (
  pool: UnifiedSubscription[],
): fc.Arbitrary<UnifiedSubscription[]> => {
  const indices = pool.map((_, i) => i)
  return fc
    .record({
      order: fc.shuffledSubarray(indices, { minLength: indices.length, maxLength: indices.length }),
      repeats: fc.array(fc.integer({ min: 1, max: 3 }), {
        minLength: indices.length,
        maxLength: indices.length,
      }),
    })
    .map(({ order, repeats }) => {
      const sequence: UnifiedSubscription[] = []
      for (const idx of order) {
        for (let k = 0; k < repeats[idx]; k++) sequence.push(pool[idx])
      }
      return sequence
    })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** The newest observation by `updatedAt` (timestamps are distinct in the pool). */
function newestByUpdatedAt(pool: UnifiedSubscription[]): UnifiedSubscription {
  return pool.reduce((best, o) => (o.updatedAt > best.updatedAt ? o : best))
}

/**
 * The number of distinct consecutive status changes when applying observations
 * in order, starting from "no subscription" (so the first applied observation is
 * always a change). Mirrors the writer's audit rule: log only when the status
 * actually changes from the previously stored status.
 */
function consecutiveStatusChanges(observations: UnifiedSubscription[]): number {
  let count = 0
  let prev: UnifiedStatus | undefined = undefined
  for (const o of observations) {
    if (prev !== o.status) count++
    prev = o.status
  }
  return count
}

/** Count status-change audit events emitted by the writer for a single provider. */
function statusChangeAuditCount(audits: SubscriptionEventEntry[], provider: ProviderId): number {
  return audits.filter((e) => e.eventType === `${provider}_synced`).length
}

/** Apply every observation in the sequence through the writer; return outcomes. */
async function applyAll(
  store: FakeStore,
  sequence: UnifiedSubscription[],
): Promise<SyncOutcome[]> {
  const outcomes: SyncOutcome[] = []
  for (const obs of sequence) {
    outcomes.push(await syncToAppwrite(USER_ID, obs, store.deps))
  }
  return outcomes
}

/** Repeat each element of `seq` consecutively `repeats[i]` times. */
function withConsecutiveDuplicates(
  seq: UnifiedSubscription[],
  repeats: number[],
): UnifiedSubscription[] {
  const out: UnifiedSubscription[] = []
  seq.forEach((obs, i) => {
    for (let k = 0; k < repeats[i]; k++) out.push(obs)
  })
  return out
}

// ─── Property 2: Idempotent sync ─────────────────────────────────────────────

describe('Property 2: Idempotent sync', () => {
  it('final stored state equals the newest-by-updatedAt observation despite duplicates and reorders', async () => {
    /**Validates: Requirements 7.8*/
    await fc.assert(
      fc.asyncProperty(
        observationPoolArb.chain((pool) =>
          reorderedWithDuplicatesArb(pool).map((sequence) => ({ pool, sequence })),
        ),
        async ({ pool, sequence }) => {
          const store = makeFakeStore()
          const outcomes = await applyAll(store, sequence)

          // A faithful store never forces the "write not confirmed" branch.
          expect(outcomes.every((o) => o.status === 'written' || o.status === 'skipped_stale')).toBe(
            true,
          )

          const newest = newestByUpdatedAt(pool)
          const doc = store.getDoc()
          expect(doc).not.toBeNull()

          // (a) Final stored state = applying only the newest observation.
          expect(doc!.status).toBe(newest.status)
          expect(doc!.plan).toBe(newest.plan)
          expect(doc!.provider).toBe(newest.provider)
          expect(doc!.providerCustomerId).toBe(newest.providerCustomerId)
          expect(doc!.providerSubscriptionId).toBe(newest.providerSubscriptionId)
          expect(doc!.cancelAtPeriodEnd).toBe(newest.cancelAtPeriodEnd)
          expect(doc!.trialEnd).toBe(newest.trialEnd)
          expect(doc!.periodEnd).toBe(newest.periodEnd)
          // No stale/bumped overwrite: the stored timestamp is exactly the newest.
          expect(doc!.updatedAt).toBe(newest.updatedAt)

          // Account prefs mirror the newest observation too.
          const prefs = store.getPrefs()
          expect(prefs.subscriptionStatus).toBe(newest.status)
          expect(prefs.subscriptionPlan).toBe(newest.plan)
          expect(prefs.providerCustomerId).toBe(newest.providerCustomerId)
          expect(prefs.subscriptionUpdatedAt).toBe(newest.updatedAt)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('in updatedAt order, audit count equals consecutive status changes, and duplicates add none', async () => {
    /**Validates: Requirements 7.8*/
    await fc.assert(
      fc.asyncProperty(
        observationPoolArb.chain((pool) =>
          fc
            .array(fc.integer({ min: 1, max: 3 }), {
              minLength: pool.length,
              maxLength: pool.length,
            })
            .map((repeats) => ({ pool, repeats })),
        ),
        async ({ pool, repeats }) => {
          const sorted = [...pool].sort((a, b) => a.updatedAt - b.updatedAt)
          const provider = pool[0].provider
          const expectedChanges = consecutiveStatusChanges(sorted)
          const newest = sorted[sorted.length - 1]

          // Apply once, in updatedAt order.
          const onceStore = makeFakeStore()
          await applyAll(onceStore, sorted)
          const onceAudits = statusChangeAuditCount(onceStore.getAudits(), provider)

          // (b) audit count == number of distinct consecutive status changes.
          expect(onceAudits).toBe(expectedChanges)
          expect(onceStore.getDoc()!.status).toBe(newest.status)
          expect(onceStore.getDoc()!.updatedAt).toBe(newest.updatedAt)

          // Re-applying identical observations (consecutive duplicates) adds
          // no extra status-change audit events and yields the same state.
          const dupStore = makeFakeStore()
          await applyAll(dupStore, withConsecutiveDuplicates(sorted, repeats))
          const dupAudits = statusChangeAuditCount(dupStore.getAudits(), provider)

          expect(dupAudits).toBe(onceAudits)
          expect(dupStore.getDoc()).toEqual(onceStore.getDoc())
          expect(dupStore.getPrefs()).toEqual(onceStore.getPrefs())
        },
      ),
      { numRuns: 300 },
    )
  })

  it('applying a single observation any number of times is identical to applying it once', async () => {
    /**Validates: Requirements 7.8*/
    await fc.assert(
      fc.asyncProperty(
        observationPoolArb.map((pool) => pool[0]),
        fc.integer({ min: 1, max: 6 }),
        async (obs, times) => {
          const once = makeFakeStore()
          await syncToAppwrite(USER_ID, obs, once.deps)

          const many = makeFakeStore()
          for (let i = 0; i < times; i++) await syncToAppwrite(USER_ID, obs, many.deps)

          // Same stored state, same prefs, and exactly one status-change audit event.
          expect(many.getDoc()).toEqual(once.getDoc())
          expect(many.getPrefs()).toEqual(once.getPrefs())
          expect(statusChangeAuditCount(many.getAudits(), obs.provider)).toBe(1)
          expect(statusChangeAuditCount(once.getAudits(), obs.provider)).toBe(1)
        },
      ),
      { numRuns: 200 },
    )
  })
})
