/**
 * Unit tests — Provider registry resolution & enablement
 *
 * Feature: unified-payment-experience, Task 2.3
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
 *
 * Covers:
 *  - getProvider returns the single registered instance when enabled (2.1)
 *  - getProvider throws an unknown-provider error for an unregistered id (2.2)
 *  - getProvider throws a not-configured error for a registered-but-disabled id (2.3)
 *  - getProvider throws an invalid-identifier error for null/undefined/empty/whitespace id (2.4)
 *  - enabledProviders returns only the enabled instances (2.5)
 *  - enabledProviders returns an empty collection when none are enabled (2.6)
 *
 * Enablement is driven by each provider's `isEnabled()`, which normally reads the
 * real environment. To exercise the enabled/disabled paths deterministically
 * (without real credentials) we spy on the imported provider objects' `isEnabled`.
 * The registry stores the same object references, so spying flows through.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getProvider,
  enabledProviders,
  providerConfig,
} from '@/lib/payments/registry'
import { stripeProvider } from '@/lib/payments/stripe-provider'
import { dodoProvider } from '@/lib/payments/dodo-provider'

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Force each provider's enablement to a fixed boolean for the test. */
function setEnablement(opts: { stripe: boolean; dodo: boolean }) {
  vi.spyOn(stripeProvider, 'isEnabled').mockReturnValue(opts.stripe)
  vi.spyOn(dodoProvider, 'isEnabled').mockReturnValue(opts.dodo)
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Resolve enabled → single instance (2.1) ────────────────────────────────

describe('getProvider — resolve enabled', () => {
  it('returns the single registered Stripe instance when it is enabled (2.1)', () => {
    setEnablement({ stripe: true, dodo: false })
    expect(getProvider('stripe')).toBe(stripeProvider)
  })

  it('returns the single registered Dodo instance when it is enabled (2.1)', () => {
    setEnablement({ stripe: false, dodo: true })
    expect(getProvider('dodopayments')).toBe(dodoProvider)
  })

  it('returns each provider instance when both are enabled (2.1)', () => {
    setEnablement({ stripe: true, dodo: true })
    expect(getProvider('stripe')).toBe(stripeProvider)
    expect(getProvider('dodopayments')).toBe(dodoProvider)
  })
})

// ─── Unknown id → unknown-provider error (2.2) ───────────────────────────────

describe('getProvider — unknown id', () => {
  it('throws an unknown-provider error for an unregistered id (2.2)', () => {
    setEnablement({ stripe: true, dodo: true })
    expect(() => getProvider('paypal' as never)).toThrow(/unknown provider/i)
  })

  it('throws an unknown-provider error for a near-miss id (2.2)', () => {
    setEnablement({ stripe: true, dodo: true })
    expect(() => getProvider('Stripe' as never)).toThrow(/unknown provider/i)
  })
})

// ─── Registered but disabled → not-configured error (2.3) ────────────────────

describe('getProvider — registered but disabled', () => {
  it('throws a not-configured error when Stripe is registered but disabled (2.3)', () => {
    setEnablement({ stripe: false, dodo: true })
    expect(() => getProvider('stripe')).toThrow(/not configured/i)
  })

  it('throws a not-configured error when Dodo is registered but disabled (2.3)', () => {
    setEnablement({ stripe: true, dodo: false })
    expect(() => getProvider('dodopayments')).toThrow(/not configured/i)
  })
})

// ─── Invalid identifier → invalid-identifier error (2.4) ─────────────────────

describe('getProvider — invalid identifier', () => {
  it('throws an invalid-identifier error for null (2.4)', () => {
    expect(() => getProvider(null)).toThrow(/invalid provider identifier/i)
  })

  it('throws an invalid-identifier error for undefined (2.4)', () => {
    expect(() => getProvider(undefined)).toThrow(/invalid provider identifier/i)
  })

  it('throws an invalid-identifier error for an empty string (2.4)', () => {
    expect(() => getProvider('')).toThrow(/invalid provider identifier/i)
  })

  it('throws an invalid-identifier error for a whitespace-only string (2.4)', () => {
    expect(() => getProvider('   ')).toThrow(/invalid provider identifier/i)
    expect(() => getProvider('\t\n')).toThrow(/invalid provider identifier/i)
  })

  it('classifies invalid ids before unknown ids (whitespace is not "unknown") (2.4)', () => {
    // A whitespace id must surface the invalid-identifier error, never unknown-provider.
    expect(() => getProvider('  ')).not.toThrow(/unknown provider/i)
  })
})

// ─── enabledProviders — only enabled instances (2.5) ─────────────────────────

describe('enabledProviders — only enabled', () => {
  it('returns only the enabled instances when a subset is enabled (2.5)', () => {
    setEnablement({ stripe: true, dodo: false })
    const result = enabledProviders()
    expect(result).toContain(stripeProvider)
    expect(result).not.toContain(dodoProvider)
    expect(result).toHaveLength(1)
  })

  it('returns both instances when both are enabled (2.5)', () => {
    setEnablement({ stripe: true, dodo: true })
    const result = enabledProviders()
    expect(result).toContain(stripeProvider)
    expect(result).toContain(dodoProvider)
    expect(result).toHaveLength(2)
  })

  it('excludes every provider whose isEnabled reports false (2.5)', () => {
    setEnablement({ stripe: false, dodo: true })
    const result = enabledProviders()
    expect(result).toEqual([dodoProvider])
  })
})

// ─── enabledProviders — empty when none enabled (2.6) ────────────────────────

describe('enabledProviders — none enabled', () => {
  it('returns an empty collection when no provider is enabled (2.6)', () => {
    setEnablement({ stripe: false, dodo: false })
    expect(enabledProviders()).toEqual([])
  })
})

// ─── providerConfig agrees with enablement (cross-check 2.5/2.6) ─────────────

describe('providerConfig', () => {
  it('reflects per-provider enablement booleans', () => {
    setEnablement({ stripe: true, dodo: false })
    expect(providerConfig()).toEqual({ stripeEnabled: true, dodoEnabled: false })
  })

  it('reports both disabled when none are enabled (2.6)', () => {
    setEnablement({ stripe: false, dodo: false })
    expect(providerConfig()).toEqual({ stripeEnabled: false, dodoEnabled: false })
  })
})
