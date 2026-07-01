/**
 * Unit Tests — Subscription Mapper (read/write shim)
 *
 * Covers the canonical-first / legacy-fallback read path (`toUnified`), the
 * dual-write path (`toDocFields`), and status normalization (`normalizeStatus`).
 *
 * Scenarios:
 * - legacy-only documents (infer provider from which legacy customer id exists)
 * - canonical-only documents
 * - mixed documents (canonical takes precedence over legacy)
 * - status normalization including unknown → `incomplete`
 * - unknown `provider` value → null
 * - no provider + no customer id → null
 * - provider present but no resolvable customer id → null
 *
 * Requirements: 13.1, 13.2, 13.6, 13.8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SubscriptionDoc } from '@/lib/appwrite-server'
import type { UnifiedSubscription } from '@/lib/payments/provider'
import {
  toUnified,
  toDocFields,
  normalizeStatus,
} from '@/lib/payments/subscription-mapper'

/** Build a SubscriptionDoc with sensible defaults, overridable per test. */
function makeDoc(overrides: Partial<SubscriptionDoc> = {}): SubscriptionDoc {
  return {
    userId: 'user_1',
    status: 'active',
    plan: 'monthly',
    updatedAt: 1000,
    ...overrides,
  }
}

describe('normalizeStatus', () => {
  it.each([
    'trialing',
    'active',
    'past_due',
    'canceled',
    'expired',
    'incomplete',
    'unpaid',
  ] as const)('passes through the known status "%s"', (status) => {
    expect(normalizeStatus(status)).toBe(status)
  })

  it.each([
    ['unknown', 'incomplete'],
    ['ACTIVE', 'incomplete'], // case-sensitive: not a known value
    ['', 'incomplete'],
    ['paused', 'incomplete'],
  ])('maps unrecognized status "%s" to incomplete', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })

  it('maps null/undefined to incomplete (13.6)', () => {
    expect(normalizeStatus(null)).toBe('incomplete')
    expect(normalizeStatus(undefined)).toBe('incomplete')
  })
})

describe('toUnified — legacy-only documents (13.1)', () => {
  it('infers stripe from a legacy stripeCustomerId', () => {
    const doc = makeDoc({
      stripeCustomerId: 'cus_stripe_1',
      stripeSubscriptionId: 'sub_stripe_1',
    })
    const result = toUnified(doc)
    expect(result).not.toBeNull()
    expect(result!.provider).toBe('stripe')
    expect(result!.providerCustomerId).toBe('cus_stripe_1')
    expect(result!.providerSubscriptionId).toBe('sub_stripe_1')
  })

  it('infers dodopayments from a legacy dodopaymentsCustomerId', () => {
    const doc = makeDoc({
      dodopaymentsCustomerId: 'cus_dodo_1',
      dodopaymentsSubscriptionId: 'sub_dodo_1',
    })
    const result = toUnified(doc)
    expect(result).not.toBeNull()
    expect(result!.provider).toBe('dodopayments')
    expect(result!.providerCustomerId).toBe('cus_dodo_1')
    expect(result!.providerSubscriptionId).toBe('sub_dodo_1')
  })

  it('prefers dodopayments when both legacy customer ids exist and no canonical provider', () => {
    const doc = makeDoc({
      stripeCustomerId: 'cus_stripe_1',
      dodopaymentsCustomerId: 'cus_dodo_1',
    })
    const result = toUnified(doc)
    // Inference order checks the dodo customer id first.
    expect(result!.provider).toBe('dodopayments')
    expect(result!.providerCustomerId).toBe('cus_dodo_1')
  })
})

describe('toUnified — canonical-only documents (13.1)', () => {
  it('reads canonical provider and ids when no legacy fields are present', () => {
    const doc = makeDoc({
      provider: 'stripe',
      providerCustomerId: 'cus_canon_1',
      providerSubscriptionId: 'sub_canon_1',
      plan: 'yearly',
      status: 'trialing',
      trialEnd: 5000,
      periodEnd: 9000,
      cancelAtPeriodEnd: true,
      updatedAt: 1234,
    })
    const result = toUnified(doc)
    expect(result).toEqual<UnifiedSubscription>({
      provider: 'stripe',
      providerCustomerId: 'cus_canon_1',
      providerSubscriptionId: 'sub_canon_1',
      status: 'trialing',
      plan: 'yearly',
      trialEnd: 5000,
      periodEnd: 9000,
      cancelAtPeriodEnd: true,
      updatedAt: 1234,
    })
  })

  it('defaults cancelAtPeriodEnd to false and updatedAt to 0 when absent', () => {
    const doc = makeDoc({
      provider: 'dodopayments',
      providerCustomerId: 'cus_canon_2',
      cancelAtPeriodEnd: undefined,
      updatedAt: undefined as unknown as number,
    })
    const result = toUnified(doc)
    expect(result!.cancelAtPeriodEnd).toBe(false)
    expect(result!.updatedAt).toBe(0)
  })

  it('defaults plan to monthly for any non-yearly value', () => {
    const doc = makeDoc({
      provider: 'stripe',
      providerCustomerId: 'cus_canon_3',
      plan: 'something-else',
    })
    expect(toUnified(doc)!.plan).toBe('monthly')
  })
})

describe('toUnified — mixed documents (canonical takes precedence) (13.1)', () => {
  it('uses canonical provider over conflicting legacy customer ids', () => {
    const doc = makeDoc({
      provider: 'stripe',
      providerCustomerId: 'cus_canon',
      providerSubscriptionId: 'sub_canon',
      // Conflicting legacy fields that should be ignored for resolution.
      stripeCustomerId: 'cus_legacy_stripe',
      dodopaymentsCustomerId: 'cus_legacy_dodo',
    })
    const result = toUnified(doc)
    expect(result!.provider).toBe('stripe')
    expect(result!.providerCustomerId).toBe('cus_canon')
    expect(result!.providerSubscriptionId).toBe('sub_canon')
  })

  it('falls back to the provider-specific legacy id when canonical id is empty', () => {
    const doc = makeDoc({
      provider: 'dodopayments',
      providerCustomerId: '   ', // whitespace → treated as absent
      dodopaymentsCustomerId: 'cus_dodo_legacy',
      dodopaymentsSubscriptionId: 'sub_dodo_legacy',
    })
    const result = toUnified(doc)
    expect(result!.provider).toBe('dodopayments')
    expect(result!.providerCustomerId).toBe('cus_dodo_legacy')
    expect(result!.providerSubscriptionId).toBe('sub_dodo_legacy')
  })

  it('normalizes an unknown stored status while resolving the rest of the document', () => {
    const doc = makeDoc({
      provider: 'stripe',
      providerCustomerId: 'cus_x',
      status: 'gibberish',
    })
    expect(toUnified(doc)!.status).toBe('incomplete')
  })
})

describe('toUnified — rejection paths', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('returns null for an unknown provider value (13.8)', () => {
    const doc = makeDoc({
      provider: 'paypal',
      providerCustomerId: 'cus_unknown',
      stripeCustomerId: 'cus_legacy',
    })
    expect(toUnified(doc)).toBeNull()
    expect(errorSpy).toHaveBeenCalledOnce()
  })

  it('returns null when there is no provider and no legacy customer id (13.2)', () => {
    const doc = makeDoc({})
    expect(toUnified(doc)).toBeNull()
  })

  it('returns null when a provider is present but no customer id can be resolved (13.2)', () => {
    const doc = makeDoc({
      provider: 'stripe',
      // no canonical and no legacy stripe customer id
    })
    expect(toUnified(doc)).toBeNull()
  })

  it('treats a whitespace-only provider as absent and infers from legacy ids', () => {
    const doc = makeDoc({
      provider: '   ',
      stripeCustomerId: 'cus_legacy_stripe',
    })
    const result = toUnified(doc)
    expect(result!.provider).toBe('stripe')
    expect(result!.providerCustomerId).toBe('cus_legacy_stripe')
  })
})

describe('toDocFields — dual-write mirroring', () => {
  it('mirrors stripe canonical ids into legacy stripe fields', () => {
    const sub: UnifiedSubscription = {
      provider: 'stripe',
      providerCustomerId: 'cus_s',
      providerSubscriptionId: 'sub_s',
      status: 'active',
      plan: 'monthly',
      cancelAtPeriodEnd: false,
      updatedAt: 42,
    }
    const fields = toDocFields(sub)
    expect(fields.provider).toBe('stripe')
    expect(fields.providerCustomerId).toBe('cus_s')
    expect(fields.providerSubscriptionId).toBe('sub_s')
    expect(fields.stripeCustomerId).toBe('cus_s')
    expect(fields.stripeSubscriptionId).toBe('sub_s')
    expect(fields.dodopaymentsCustomerId).toBeUndefined()
  })

  it('mirrors dodopayments canonical ids into legacy dodo fields', () => {
    const sub: UnifiedSubscription = {
      provider: 'dodopayments',
      providerCustomerId: 'cus_d',
      providerSubscriptionId: 'sub_d',
      status: 'active',
      plan: 'yearly',
      cancelAtPeriodEnd: false,
      updatedAt: 7,
    }
    const fields = toDocFields(sub)
    expect(fields.dodopaymentsCustomerId).toBe('cus_d')
    expect(fields.dodopaymentsSubscriptionId).toBe('sub_d')
    expect(fields.stripeCustomerId).toBeUndefined()
    expect(fields.stripeSubscriptionId).toBeUndefined()
  })

  it('round-trips through toUnified preserving the provider (13.1)', () => {
    const sub: UnifiedSubscription = {
      provider: 'dodopayments',
      providerCustomerId: 'cus_rt',
      providerSubscriptionId: 'sub_rt',
      status: 'past_due',
      plan: 'yearly',
      trialEnd: 100,
      periodEnd: 200,
      cancelAtPeriodEnd: true,
      updatedAt: 999,
    }
    const doc = toDocFields(sub) as SubscriptionDoc
    const back = toUnified(doc)
    expect(back).toEqual(sub)
  })
})
