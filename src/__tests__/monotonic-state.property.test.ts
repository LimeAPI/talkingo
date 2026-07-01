/**
 * Property Test — Monotonic state
 *
 * Feature: unified-payment-experience, Property 4: Monotonic state
 * **Validates: Requirements 7.1, 7.2**
 *
 * Property 4: When many writes — each carrying its own observation timestamp
 * (`updatedAt`) — are applied to the SAME subscription document in arbitrary
 * order, the stored state always reflects the observation with the maximum
 * `updatedAt`. Stale (older) writes are skipped and never clobber newer state
 * (Req 7.1), and a newer-or-equal write is persisted under the `updatedAt`
 * guard (Req 7.2). Equivalently: the stored `updatedAt` is monotonic — it never
 * decreases as writes are applied.
 *
 * Uses Vitest + fast-check. The `syncToAppwrite` writer takes injectable
 * `SyncDeps`, so we drive it against an in-memory fake store (NO Appwrite module
 * mocking). All generated observations keep a valid positive finite `updatedAt`
 * so the writer never rejects them as `invalid_timestamp`; this isolates the
 * ordering/monotonicity behaviour under test.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { SubscriptionDoc, SubscriptionEventEntry } from '@/lib/appwrite-server'
import { syncToAppwrite, type SyncDeps } from '@/lib/payments/sync'
import { toDocFields } from '@/lib/payments/subscription-mapper'
import type {
  ProviderId,
  UnifiedStatus,
  UnifiedSubscription,
} from '@/lib/payments/provider'

// ─── In-memory fake store (built via the injectable deps, no module mocking) ──

interface FakeStore {
  deps: SyncDeps
  getDoc: () => SubscriptionDoc | null
  events: SubscriptionEventEntry[]
}

/**
 * A faithful in-memory stand-in for the Appwrite operations `syncToAppwrite`
 * depends on. `upsertSubscription` merges the written fields onto the stored
 * document (mirroring Appwrite upsert semantics); `getSubscription` returns the
 * current document. No conditional logic lives here — the monotonic guarantee
 * is entirely the writer's responsibility.
 */
function makeFakeStore(): FakeStore {
  let doc: SubscriptionDoc | null = null
  const events: SubscriptionEventEntry[] = []
  const prefs: Record<string, unknown> = {}

  const deps: SyncDeps = {
    getSubscription: async () => doc,
    upsertSubscription: async (userId, fields) => {
      doc = { ...(doc ?? { userId }), ...fields, userId } as SubscriptionDoc
    },
    updateUserPrefs: async (_userId, p) => {
      Object.assign(prefs, p)
    },
    logSubscriptionEvent: async (entry) => {
      events.push(entry)
    },
  }

  return { deps, getDoc: () => doc, events }
}

// ─── Arbitraries (generators) ─────────────────────────────────────────────────

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
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => s.trim().length > 0)

/**
 * A valid observation timestamp: a positive, finite epoch-ms value. Constrained
 * to keep the writer out of its `invalid_timestamp` branch so the property
 * isolates ordering/monotonicity.
 */
const validUpdatedAtArb = fc.integer({ min: 1, max: 4_102_444_800_000 })

/**
 * A UnifiedSubscription observation pinned to a single customer/provider so that
 * every generated write targets the SAME document. Only `status`, `plan`, the
 * optional timestamps, `cancelAtPeriodEnd`, and `updatedAt` vary.
 */
function observationArb(
  provider: ProviderId,
  providerCustomerId: string,
): fc.Arbitrary<UnifiedSubscription> {
  return fc.record({
    provider: fc.constant(provider),
    providerCustomerId: fc.constant(providerCustomerId),
    providerSubscriptionId: fc.option(nonEmptyIdArb, { nil: undefined }),
    status: unifiedStatusArb,
    plan: planArb,
    trialEnd: fc.option(validUpdatedAtArb, { nil: undefined }),
    periodEnd: fc.option(validUpdatedAtArb, { nil: undefined }),
    cancelAtPeriodEnd: fc.boolean(),
    updatedAt: validUpdatedAtArb,
  })
}

/**
 * A non-empty sequence of writes targeting the same document, plus the fixed
 * provider/customer those writes share.
 */
const writeSequenceArb = fc
  .tuple(providerIdArb, nonEmptyIdArb)
  .chain(([provider, customerId]) =>
    fc.record({
      provider: fc.constant(provider),
      customerId: fc.constant(customerId),
      writes: fc.array(observationArb(provider, customerId), {
        minLength: 1,
        maxLength: 25,
      }),
    }),
  )

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The observation that the stored state MUST reflect after applying the whole
 * sequence: among all writes with the maximum `updatedAt`, the LAST one applied
 * wins (a newer-or-equal write is persisted, so ties resolve to the latest).
 */
function expectedWinner(writes: UnifiedSubscription[]): UnifiedSubscription {
  const max = Math.max(...writes.map((w) => w.updatedAt))
  // Last write in arrival order whose updatedAt equals the maximum.
  return [...writes].reverse().find((w) => w.updatedAt === max)!
}

// ─── Property 4: Monotonic state ──────────────────────────────────────────────

describe('Property 4: Monotonic state', () => {
  it('final stored state reflects the observation with the maximum updatedAt', async () => {
    /**Validates: Requirements 7.1, 7.2*/
    await fc.assert(
      fc.asyncProperty(writeSequenceArb, async ({ writes }) => {
        const store = makeFakeStore()

        for (const w of writes) {
          await syncToAppwrite('user-monotonic', w, store.deps)
        }

        const finalDoc = store.getDoc()
        const winner = expectedWinner(writes)
        const maxUpdatedAt = Math.max(...writes.map((w) => w.updatedAt))

        // Stored state is never null after at least one valid write.
        expect(finalDoc).not.toBeNull()
        // The stored observation timestamp equals the maximum across all writes.
        expect(finalDoc!.updatedAt).toBe(maxUpdatedAt)
        // The stored content corresponds to the winning (max-timestamp) write.
        expect(finalDoc!.status).toBe(winner.status)
        expect(finalDoc!.plan).toBe(winner.plan)
        expect(finalDoc!.provider).toBe(winner.provider)
        expect(finalDoc!.providerCustomerId).toBe(winner.providerCustomerId)
        expect(finalDoc!.cancelAtPeriodEnd).toBe(winner.cancelAtPeriodEnd)

        // Cross-check against the canonical mapper: the stored fields match
        // exactly what toDocFields(winner) would write.
        const winnerFields = toDocFields(winner)
        expect(finalDoc!.status).toBe(winnerFields.status)
        expect(finalDoc!.updatedAt).toBe(winnerFields.updatedAt)
      }),
      { numRuns: 300 },
    )
  })

  it('stored updatedAt is monotonic — it never decreases as writes are applied', async () => {
    /**Validates: Requirements 7.1, 7.2*/
    await fc.assert(
      fc.asyncProperty(writeSequenceArb, async ({ writes }) => {
        const store = makeFakeStore()
        let runningMax = 0

        for (const w of writes) {
          const before = store.getDoc()?.updatedAt ?? 0
          await syncToAppwrite('user-monotonic', w, store.deps)
          const after = store.getDoc()!.updatedAt

          // Invariant: the stored timestamp never goes backwards...
          expect(after).toBeGreaterThanOrEqual(before)
          // ...and always equals the maximum observation seen so far.
          runningMax = Math.max(runningMax, w.updatedAt)
          expect(after).toBe(runningMax)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('a stale (older) write never clobbers newer stored state', async () => {
    /**Validates: Requirements 7.1*/
    await fc.assert(
      fc.asyncProperty(
        nonEmptyIdArb,
        providerIdArb,
        fc.integer({ min: 2, max: 4_102_444_800_000 }),
        async (customerId, provider, newerTs) => {
          const olderTs = newerTs - 1
          const store = makeFakeStore()

          const newer: UnifiedSubscription = {
            provider,
            providerCustomerId: customerId,
            status: 'active',
            plan: 'yearly',
            cancelAtPeriodEnd: false,
            updatedAt: newerTs,
          }
          const older: UnifiedSubscription = {
            provider,
            providerCustomerId: customerId,
            status: 'canceled',
            plan: 'monthly',
            cancelAtPeriodEnd: true,
            updatedAt: olderTs,
          }

          // Apply the newer write first, then the stale older one.
          await syncToAppwrite('user-monotonic', newer, store.deps)
          const outcome = await syncToAppwrite('user-monotonic', older, store.deps)

          // The stale write is reported skipped and leaves the newer state intact.
          expect(outcome.status).toBe('skipped_stale')
          const finalDoc = store.getDoc()!
          expect(finalDoc.updatedAt).toBe(newerTs)
          expect(finalDoc.status).toBe('active')
          expect(finalDoc.plan).toBe('yearly')
        },
      ),
      { numRuns: 200 },
    )
  })
})
