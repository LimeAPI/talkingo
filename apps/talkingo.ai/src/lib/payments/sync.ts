/**
 * `syncToAppwrite` — the single, shared, race-safe idempotent writer.
 *
 * Return-from-checkout sync, webhook handlers, and user actions (cancel /
 * reactivate / change-plan) all persist subscription state through this one
 * function. Centralizing the write is what makes "never lose a payment"
 * tractable: ordering, idempotency, dual-write of legacy fields, account-prefs
 * hydration, and the audit trail all live in one place.
 *
 * Algorithm (see design.md → "Race-safe persistence"):
 *  1. Reject writes whose observation timestamp (`updatedAt`) is missing/invalid.
 *  2. Skip stale writes — an older observation never clobbers a newer stored state.
 *  3. Persist canonical + mirrored legacy fields, update account prefs, and log a
 *     status-change audit event (only when the status actually changed, so
 *     re-applying the same observation produces no extra audit events).
 *  4. Verify the write once; on mismatch retry exactly once with an `updatedAt`
 *     bumped strictly above the stored document's. If it still doesn't match,
 *     stop, log the discrepancy, and return a write-not-confirmed error.
 *
 * The Appwrite dependencies are injected (defaulting to the real
 * `appwrite-server` helpers) so the property tests in 4.2 / 4.3 can drive the
 * writer against an in-memory fake without mocking modules.
 *
 * _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
 */

import type { SubscriptionDoc, SubscriptionEventEntry } from '@/lib/appwrite-server'
import type { UnifiedStatus, UnifiedSubscription } from './provider'
import { toDocFields } from './subscription-mapper'

/**
 * The Appwrite operations `syncToAppwrite` depends on. Injected so the writer
 * can be exercised against an in-memory fake in tests.
 */
export interface SyncDeps {
  getSubscription: (userId: string) => Promise<SubscriptionDoc | null>
  upsertSubscription: (userId: string, fields: Partial<SubscriptionDoc>) => Promise<void>
  updateUserPrefs: (userId: string, prefs: Record<string, unknown>) => Promise<void>
  logSubscriptionEvent: (entry: SubscriptionEventEntry) => Promise<void>
}

/** The outcome of a `syncToAppwrite` call. */
export type SyncOutcome =
  /** The incoming observation was persisted (or re-affirmed) successfully. */
  | { status: 'written' }
  /** The incoming observation was older than the stored state and was ignored. */
  | { status: 'skipped_stale' }
  /** The incoming observation had a missing/invalid `updatedAt`; nothing was written. */
  | { status: 'invalid_timestamp' }
  /** The write could not be confirmed after a single retry. */
  | {
      status: 'write_not_confirmed'
      intendedStatus: UnifiedStatus
      observedStatus: UnifiedStatus | null
    }

/** `updatedAt` is the provider observation time in epoch-ms; it must be a finite, positive number. */
function isValidObservationTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Build the account-prefs patch for an observation. Mirrors the shape written by
 * the existing Stripe/Dodo sync helpers so client hydration keeps working.
 */
function prefsFrom(s: UnifiedSubscription): Record<string, unknown> {
  const customerKey = s.provider === 'stripe' ? 'stripeCustomerId' : 'dodopaymentsCustomerId'
  return {
    [customerKey]: s.providerCustomerId,
    providerCustomerId: s.providerCustomerId,
    subscriptionStatus: s.status,
    subscriptionPlan: s.plan,
    ...(s.trialEnd ? { subscriptionTrialEnd: s.trialEnd } : {}),
    ...(s.periodEnd ? { subscriptionPeriodEnd: s.periodEnd } : {}),
    subscriptionUpdatedAt: s.updatedAt,
  }
}

/** Lazily-resolved default dependencies backed by the real Appwrite admin helpers. */
async function defaultDeps(): Promise<SyncDeps> {
  const mod = await import('@/lib/appwrite-server')
  return {
    getSubscription: (userId) => mod.getSubscription(userId),
    upsertSubscription: (userId, fields) =>
      mod.upsertSubscription(userId, fields as Omit<SubscriptionDoc, '$id' | 'userId'>),
    updateUserPrefs: (userId, prefs) => mod.updateUserPrefs(userId, prefs),
    logSubscriptionEvent: (entry) => mod.logSubscriptionEvent(entry),
  }
}

/**
 * Persist a `UnifiedSubscription` race-safely and idempotently.
 *
 * @param userId   The owning user.
 * @param incoming The provider-agnostic snapshot to persist; `incoming.updatedAt`
 *                 is the observation time used for ordering.
 * @param deps     Optional injected Appwrite operations (defaults to the real
 *                 admin helpers). Tests pass an in-memory fake here.
 */
export async function syncToAppwrite(
  userId: string,
  incoming: UnifiedSubscription,
  deps?: SyncDeps,
): Promise<SyncOutcome> {
  const d = deps ?? (await defaultDeps())

  // 7.3: reject writes with a missing or invalid observation timestamp.
  if (!isValidObservationTimestamp(incoming.updatedAt)) {
    return { status: 'invalid_timestamp' }
  }

  const existing = await d.getSubscription(userId)

  // 7.1: an older observation never clobbers a newer stored state.
  if (existing != null && (existing.updatedAt ?? 0) > incoming.updatedAt) {
    return { status: 'skipped_stale' }
  }

  // 7.2: persist canonical + mirrored legacy fields (the stale guard above is the
  // conditional that protects a concurrently-written newer state).
  const fields = toDocFields(incoming)
  await d.upsertSubscription(userId, fields)

  // 7.4: hydrate account preferences with the new state. This is a cache mirror
  // for cross-device hydration — the `subscriptions` collection written above is
  // the source of truth. A prefs failure must NOT abort the sync (which would
  // surface a successful activation as an error to the caller), so it's
  // best-effort: log and continue.
  try {
    await d.updateUserPrefs(userId, prefsFrom(incoming))
  } catch (err) {
    console.error(
      `[sync] updateUserPrefs failed for user ${userId} (subscription row already ` +
        `persisted; continuing):`,
      err instanceof Error ? err.message : err,
    )
  }

  // 7.5 / 7.8: log a status-change audit event only when the status actually
  // changed, so re-applying the same observation yields no extra audit events.
  const previousStatus = existing?.status
  const statusChanged = previousStatus !== incoming.status
  if (statusChanged) {
    await d.logSubscriptionEvent(auditEntry(userId, incoming, previousStatus))
  }

  // 7.6: verify the write once; on mismatch retry exactly once with an
  // `updatedAt` bumped strictly above the stored document's value.
  const verified = await d.getSubscription(userId)
  if (verified == null || verified.status !== incoming.status) {
    const bumpedUpdatedAt = Math.max(verified?.updatedAt ?? 0, incoming.updatedAt) + 1
    await d.upsertSubscription(userId, { ...fields, updatedAt: bumpedUpdatedAt })

    // 7.7: if it still doesn't match after the single retry, stop, record the
    // discrepancy, and report that the write could not be confirmed.
    const reVerified = await d.getSubscription(userId)
    if (reVerified == null || reVerified.status !== incoming.status) {
      const observedStatus = (reVerified?.status as UnifiedStatus | undefined) ?? null
      await d.logSubscriptionEvent({
        userId,
        eventType: `${incoming.provider}_sync_unconfirmed`,
        stripeEventId: auditEventId(incoming),
        subscriptionId: incoming.providerSubscriptionId,
        customerId: incoming.providerCustomerId,
        previousStatus,
        newStatus: incoming.status,
        plan: incoming.plan,
        timestamp: bumpedUpdatedAt,
      })
      return { status: 'write_not_confirmed', intendedStatus: incoming.status, observedStatus }
    }
  }

  return { status: 'written' }
}

/** A stable, provider-namespaced id for the audit record. */
function auditEventId(s: UnifiedSubscription): string {
  return `${s.provider}:${s.providerSubscriptionId ?? s.providerCustomerId}:${s.updatedAt}`
}

/** Build the status-change audit entry. */
function auditEntry(
  userId: string,
  incoming: UnifiedSubscription,
  previousStatus: string | undefined,
): SubscriptionEventEntry {
  return {
    userId,
    eventType: `${incoming.provider}_synced`,
    stripeEventId: auditEventId(incoming),
    subscriptionId: incoming.providerSubscriptionId,
    customerId: incoming.providerCustomerId,
    previousStatus,
    newStatus: incoming.status,
    plan: incoming.plan,
    timestamp: incoming.updatedAt,
  }
}
