/**
 * Shared Stripe SDK instance with pinned API version.
 *
 * Lazily instantiated on first access — prevents build-time crashes when
 * env vars aren't available during static analysis.
 */

import Stripe from 'stripe'
import { STRIPE_ENV, STRIPE_API_VERSION } from './env'

let _stripe: Stripe | null = null

function getStripeInstance(): Stripe {
  if (_stripe) return _stripe
  _stripe = new Stripe(STRIPE_ENV.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    typescript: true,
  })
  return _stripe
}

/** Proxy that lazily creates the Stripe instance on first method call. */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop: string | symbol) {
    const instance = getStripeInstance()
    const value = (instance as any)[prop]
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
