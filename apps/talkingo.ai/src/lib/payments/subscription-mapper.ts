/**
 * Subscription mapper — the read/write shim that isolates the provider-agnostic
 * schema change so no other code branches on field names.
 *
 * - `toUnified`  READ: derive canonical fields from a possibly-legacy document
 *                (canonical-first, legacy-fallback). Returns null when no provider
 *                or no customer id can be resolved, and rejects unknown providers.
 * - `toDocFields` WRITE: persist canonical fields AND mirror the matching legacy
 *                fields (dual-write) so existing readers keep working during migration.
 * - `normalizeStatus` maps any stored status to a `UnifiedStatus`; unknown → `incomplete`.
 *
 * _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6, 13.7, 13.8_
 */

import type { SubscriptionDoc } from '@/lib/appwrite-server'
import type { ProviderId, UnifiedStatus, UnifiedSubscription } from './provider'

/** The set of provider identifiers we recognize. */
const KNOWN_PROVIDERS: readonly ProviderId[] = ['stripe', 'dodopayments']

/** The set of valid unified status values. */
const KNOWN_STATUSES: readonly UnifiedStatus[] = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
  'incomplete',
  'unpaid',
]

function isKnownProvider(value: string): value is ProviderId {
  return (KNOWN_PROVIDERS as readonly string[]).includes(value)
}

/** Return the value only if it is a present, non-empty (non-whitespace) string. */
function nonEmpty(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? value : undefined
}

/**
 * Normalize any stored status value to a known `UnifiedStatus`.
 * Unknown values normalize to `incomplete` (never dropped).
 *
 * _Requirements: 13.6_
 */
export function normalizeStatus(status: string | undefined | null): UnifiedStatus {
  if (typeof status === 'string' && (KNOWN_STATUSES as readonly string[]).includes(status)) {
    return status as UnifiedStatus
  }
  return 'incomplete'
}

/**
 * READ: derive canonical fields from a possibly-legacy document.
 *
 * Canonical-first, legacy-fallback resolution:
 * - `provider` is read from the canonical field when present; otherwise inferred
 *   from which legacy customer id exists. A present-but-unknown `provider` value
 *   is rejected (null + surfaced error) and the document is left unmodified.
 * - customer / subscription ids prefer the canonical field, falling back to the
 *   provider-specific legacy field only when the canonical field is absent or empty.
 *
 * Returns `null` when no provider can be resolved, when the provider is unknown,
 * or when no customer id can be resolved.
 *
 * _Requirements: 13.1, 13.2, 13.7, 13.8_
 */
export function toUnified(doc: SubscriptionDoc): UnifiedSubscription | null {
  const canonicalProvider = nonEmpty(doc.provider)

  // 13.7 / 13.8: a present provider field must be a known ProviderId.
  if (canonicalProvider !== undefined && !isKnownProvider(canonicalProvider)) {
    // Surface an unrecognized-provider error; leave the stored document unmodified.
    console.error(
      `[subscription-mapper] unrecognized provider "${canonicalProvider}" ` +
        `for user ${doc.userId}; refusing to derive a unified subscription.`,
    )
    return null
  }

  const provider: ProviderId | undefined =
    (canonicalProvider as ProviderId | undefined) ??
    (nonEmpty(doc.dodopaymentsCustomerId)
      ? 'dodopayments'
      : nonEmpty(doc.stripeCustomerId)
        ? 'stripe'
        : undefined)

  // 13.2: no provider and no legacy customer id → no unified subscription.
  if (!provider) return null

  const providerCustomerId =
    nonEmpty(doc.providerCustomerId) ??
    (provider === 'stripe'
      ? nonEmpty(doc.stripeCustomerId)
      : nonEmpty(doc.dodopaymentsCustomerId))

  const providerSubscriptionId =
    nonEmpty(doc.providerSubscriptionId) ??
    (provider === 'stripe'
      ? nonEmpty(doc.stripeSubscriptionId)
      : nonEmpty(doc.dodopaymentsSubscriptionId))

  // 13.2: a resolvable customer id is required.
  if (!providerCustomerId) return null

  return {
    provider,
    providerCustomerId,
    providerSubscriptionId,
    status: normalizeStatus(doc.status),
    plan: doc.plan === 'yearly' ? 'yearly' : 'monthly',
    trialEnd: doc.trialEnd,
    periodEnd: doc.periodEnd,
    cancelAtPeriodEnd: doc.cancelAtPeriodEnd ?? false,
    updatedAt: doc.updatedAt ?? 0,
  }
}

/**
 * WRITE: persist canonical fields AND mirror the matching legacy fields (dual-write)
 * so existing readers keep working during migration. Each legacy identifier equals
 * its canonical counterpart.
 *
 * _Requirements: 13.3, 13.4_
 */
export function toDocFields(s: UnifiedSubscription): Partial<SubscriptionDoc> {
  const base: Partial<SubscriptionDoc> = {
    provider: s.provider,
    providerCustomerId: s.providerCustomerId,
    providerSubscriptionId: s.providerSubscriptionId,
    status: s.status,
    plan: s.plan,
    trialEnd: s.trialEnd,
    periodEnd: s.periodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    updatedAt: s.updatedAt,
  }

  if (s.provider === 'stripe') {
    base.stripeCustomerId = s.providerCustomerId
    base.stripeSubscriptionId = s.providerSubscriptionId
  } else {
    base.dodopaymentsCustomerId = s.providerCustomerId
    base.dodopaymentsSubscriptionId = s.providerSubscriptionId
  }

  return base
}
