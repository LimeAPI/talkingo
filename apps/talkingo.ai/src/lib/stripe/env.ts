/**
 * Stripe environment validation.
 *
 * Lazily validates required Stripe env vars on first access (not at import time).
 * This prevents build failures when env vars aren't available during static analysis.
 */

const REQUIRED_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_TRIAL',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_YEARLY',
] as const

type RequiredVar = (typeof REQUIRED_VARS)[number]

let _cached: Record<RequiredVar, string> | null = null

function readEnv(): Record<RequiredVar, string> {
  if (_cached) return _cached

  const missing: string[] = []
  const out = {} as Record<RequiredVar, string>

  for (const key of REQUIRED_VARS) {
    const v = process.env[key]
    if (!v || v.trim() === '' || v.startsWith('your_') || v.includes('xxx')) {
      missing.push(key)
    } else {
      out[key] = v
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[stripe-env] Missing or placeholder values for required env vars: ${missing.join(', ')}. ` +
        `Set these in apps/web/.env.local. See .env.example for reference.`
    )
  }

  _cached = out
  return out
}

/** Lazy accessor — only validates when first accessed at runtime, not at build time. */
export const STRIPE_ENV = new Proxy({} as Record<RequiredVar, string>, {
  get(_target, prop: string) {
    const env = readEnv()
    return env[prop as RequiredVar]
  },
})

export const STRIPE_PRICES = {
  get trial() { return STRIPE_ENV.STRIPE_PRICE_TRIAL },
  get monthly() { return STRIPE_ENV.STRIPE_PRICE_MONTHLY },
  get yearly() { return STRIPE_ENV.STRIPE_PRICE_YEARLY },
} as const

export const STRIPE_API_VERSION = '2026-05-27.dahlia' as const
