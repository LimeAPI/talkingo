/**
 * DodoPayments environment validation (with key aliasing).
 *
 * - Accepts both "DODOPAYMENTS_*" and "DODO_PAYMENTS_*" prefixes.
 * - Uses Product IDs (not price IDs) for Dodo subscriptions.
 * - Lazy validation on first access.
 */

type RequiredVar =
  | 'DODOPAYMENTS_API_KEY'
  | 'DODOPAYMENTS_WEBHOOK_SECRET'
  | 'DODOPAYMENTS_PRODUCT_MONTHLY'
  | 'DODOPAYMENTS_PRODUCT_YEARLY'

const GROUPS: { keys: string[]; outKey: RequiredVar }[] = [
  { keys: ['DODOPAYMENTS_API_KEY', 'DODO_PAYMENTS_API_KEY'], outKey: 'DODOPAYMENTS_API_KEY' },
  { keys: ['DODOPAYMENTS_WEBHOOK_SECRET', 'DODO_PAYMENTS_WEBHOOK_SECRET'], outKey: 'DODOPAYMENTS_WEBHOOK_SECRET' },
  { keys: ['DODOPAYMENTS_PRODUCT_MONTHLY', 'DODO_PAYMENTS_PRODUCT_MONTHLY'], outKey: 'DODOPAYMENTS_PRODUCT_MONTHLY' },
  { keys: ['DODOPAYMENTS_PRODUCT_YEARLY', 'DODO_PAYMENTS_PRODUCT_YEARLY'], outKey: 'DODOPAYMENTS_PRODUCT_YEARLY' },
]

let _cached: Record<RequiredVar, string> | null = null

function readEnv(): Record<RequiredVar, string> {
  if (_cached) return _cached

  const out = {} as Record<RequiredVar, string>
  const missing: string[] = []

  for (const g of GROUPS) {
    let value: string | undefined
    for (const k of g.keys) {
      const v = process.env[k]
      if (v && v.trim() !== '' && !v.startsWith('your_') && !v.includes('xxx') && !v.startsWith('sk_test_replace')) {
        value = v
        break
      }
    }
    if (!value) {
      missing.push(g.outKey)
    } else {
      out[g.outKey] = value
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[dodopayments-env] Missing or placeholder values for: ${missing.join(', ')}. ` +
      `Set them in .env.local — see .env.example for reference.`
    )
  }

  _cached = out
  return out
}

/** Lazy accessor — only validates when first accessed at runtime, not at build time. */
export const DODOPAYMENTS_ENV = new Proxy({} as Record<RequiredVar, string>, {
  get(_target, prop: string) {
    const env = readEnv()
    return env[prop as RequiredVar]
  },
})

/** Server-safe product ids for Dodo subscriptions */
export const DODOPAYMENTS_PRODUCTS = {
  get monthly() { return DODOPAYMENTS_ENV.DODOPAYMENTS_PRODUCT_MONTHLY },
  get yearly() { return DODOPAYMENTS_ENV.DODOPAYMENTS_PRODUCT_YEARLY },
} as const

/**
 * Optional brand id for the Dodo hosted checkout (controls logo/branding).
 *
 * This is NOT part of the required-credentials set, so a missing value never
 * disables the provider — it simply falls back to the merchant's default brand.
 * Accepts both `DODOPAYMENTS_BRAND_ID` and `DODO_PAYMENTS_BRAND_ID` spellings.
 */
export function getDodoBrandId(): string | undefined {
  const raw = process.env.DODOPAYMENTS_BRAND_ID ?? process.env.DODO_PAYMENTS_BRAND_ID
  const value = raw?.trim()
  if (!value || value.startsWith('your_') || value.includes('xxx')) return undefined
  return value
}

/**
 * Dodo SDK environment ("test_mode" | "live_mode"), defaulting to "test_mode".
 *
 * Not part of the required-credentials set (a missing value never disables the
 * provider). Accepts both `DODOPAYMENTS_ENVIRONMENT` and the legacy
 * `DODO_PAYMENTS_ENVIRONMENT` spelling so config stays consistent regardless of
 * which prefix is set in `.env.local`.
 */
export function getDodoEnvironment(): 'test_mode' | 'live_mode' {
  const raw = (process.env.DODOPAYMENTS_ENVIRONMENT ?? process.env.DODO_PAYMENTS_ENVIRONMENT)?.trim()
  return raw === 'live_mode' ? 'live_mode' : 'test_mode'
}
