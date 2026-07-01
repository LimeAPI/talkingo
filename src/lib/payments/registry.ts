/**
 * Provider registry — the single source of truth for resolving payment
 * providers by id and for reporting which providers are enabled.
 *
 * Every `/api/billing/*` route resolves a `PaymentProvider` through this
 * registry instead of branching on a specific SDK. Enablement is derived
 * solely from each provider's `isEnabled()` (which reads the real environment),
 * so `config`, `recommend-provider`, and `checkout` can never disagree about
 * whether a provider is available — fixing the historical env-var split bug.
 *
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 3.4, 3.5, 3.6_
 */

import { dodoProvider } from './dodo-provider'
import { stripeProvider } from './stripe-provider'
import type { PaymentProvider, ProviderId } from './provider'

/** All registered providers, keyed by their canonical id. */
const PROVIDERS: Record<ProviderId, PaymentProvider> = {
  stripe: stripeProvider,
  dodopayments: dodoProvider,
}

/** The set of registered provider ids (used for runtime id validation). */
const REGISTERED_IDS = Object.keys(PROVIDERS) as ProviderId[]

function isRegisteredId(id: string): id is ProviderId {
  return (REGISTERED_IDS as string[]).includes(id)
}

/**
 * Resolve a provider by id.
 *
 * - Throws an invalid-identifier error if `id` is null, undefined, empty, or
 *   only whitespace (Req 2.4).
 * - Throws an unknown-provider error if `id` is not registered (Req 2.2).
 * - Throws a not-configured error if the provider is registered but its
 *   `isEnabled()` reports false (Req 2.3).
 * - Otherwise returns the single registered instance for that id (Req 2.1).
 *
 * In every error case the registry contents are left unchanged.
 */
export function getProvider(id: ProviderId | string | null | undefined): PaymentProvider {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`Invalid provider identifier: ${JSON.stringify(id)}`)
  }

  if (!isRegisteredId(id)) {
    throw new Error(`Unknown provider: ${id}`)
  }

  const provider = PROVIDERS[id]
  if (!provider.isEnabled()) {
    throw new Error(`Provider not configured: ${id}`)
  }

  return provider
}

/**
 * All enabled providers — the set of registered instances whose `isEnabled()`
 * reports true. Returns an empty array when none are enabled.
 *
 * Used by `config` and reconcile-all.
 *
 * _Requirements: 2.5, 2.6_
 */
export function enabledProviders(): PaymentProvider[] {
  return Object.values(PROVIDERS).filter((p) => p.isEnabled())
}

/**
 * Single source of truth for "is X enabled" — fixes the env-var split bug where
 * different routes read different env spellings. All callers derive enablement
 * from here (which delegates to each provider's `isEnabled()`).
 *
 * _Requirements: 3.6, 3.7_
 */
export function providerConfig(): { stripeEnabled: boolean; dodoEnabled: boolean } {
  return {
    stripeEnabled: PROVIDERS.stripe.isEnabled(),
    dodoEnabled: PROVIDERS.dodopayments.isEnabled(),
  }
}
