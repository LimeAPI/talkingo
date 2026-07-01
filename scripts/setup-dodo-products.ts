/**
 * Idempotent DodoPayments product setup for the Talkingo web app.
 *
 * Run with:
 *   npm run dodo:setup
 *
 * Creates (or reuses, matched by metadata) the subscription + trial-fee products
 * the app needs. Dodo uses PRODUCT ids (pdt_...) for subscriptions — distinct
 * from Stripe's price ids.
 *   - Trial fee → one-time $5.00 (→ DODOPAYMENTS_PRODUCT_TRIAL)
 *   - Monthly   → $30.00/month   (→ DODOPAYMENTS_PRODUCT_MONTHLY)
 *   - Yearly    → $360.00/year   (→ DODOPAYMENTS_PRODUCT_YEARLY)
 *
 * The 5-day trial mirrors Stripe: the one-time $5 fee is bundled with the first
 * subscription payment via `one_time_product_cart`, with `trial_period_days: 5`
 * applied at checkout (so the first recurring charge lands after 5 days).
 *
 * Localized pricing: enable **Adaptive Currency** in the Dodo dashboard for
 * automatic local-currency display + local payment methods. Optionally add
 * per-country PPP rules later via `products.localizedPrices.create`.
 *
 * Reads DODOPAYMENTS_API_KEY + DODO(_)PAYMENTS_ENVIRONMENT from .env.local.
 * Prints the resolved product ids at the end so you can paste them into .env.local.
 */

import DodoPayments from 'dodopayments'

const API_KEY = process.env.DODOPAYMENTS_API_KEY ?? process.env.DODO_PAYMENTS_API_KEY
const ENVIRONMENT =
  (process.env.DODOPAYMENTS_ENVIRONMENT ?? process.env.DODO_PAYMENTS_ENVIRONMENT)?.trim() ===
  'live_mode'
    ? 'live_mode'
    : 'test_mode'

if (!API_KEY || API_KEY.trim() === '') {
  console.error('\n❌ Missing DODOPAYMENTS_API_KEY. Set it in .env.local before running.\n')
  process.exit(1)
}

const dodo = new DodoPayments({ bearerToken: API_KEY, environment: ENVIRONMENT })

const META_KEY = 'talkingo_plan'

interface ProductSpec {
  plan: 'trial' | 'monthly' | 'yearly'
  name: string
  description: string
  /** lowest denomination (cents) */
  price: number
  /** recurring interval, or undefined for a one-time product */
  interval?: 'Month' | 'Year'
}

const SPECS: ProductSpec[] = [
  {
    plan: 'trial',
    name: 'Talkingo Premium — 5-Day Trial Fee',
    description: 'One-time $5 fee for the Talkingo Premium 5-day trial.',
    price: 500,
    // no interval → one-time product
  },
  {
    plan: 'monthly',
    name: 'Talkingo Premium — Monthly',
    description: 'Talkingo Premium — unlimited AI language practice, billed monthly.',
    price: 3000,
    interval: 'Month',
  },
  {
    plan: 'yearly',
    name: 'Talkingo Premium — Yearly',
    description: 'Talkingo Premium — unlimited AI language practice, billed annually.',
    price: 36000,
    interval: 'Year',
  },
]

/** Build the Dodo price object for a spec (recurring or one-time). */
function priceFor(spec: ProductSpec): any {
  if (!spec.interval) {
    return {
      type: 'one_time_price',
      currency: 'USD',
      price: spec.price,
      discount: 0,
      purchasing_power_parity: false,
      tax_inclusive: false,
    }
  }
  return {
    type: 'recurring_price',
    currency: 'USD',
    price: spec.price,
    discount: 0,
    purchasing_power_parity: false,
    payment_frequency_count: 1,
    payment_frequency_interval: spec.interval,
    subscription_period_count: 1,
    subscription_period_interval: spec.interval,
    tax_inclusive: false,
    trial_period_days: 0,
  }
}

/** Find an existing product for a plan (matched by metadata) or create it. */
async function ensureProduct(spec: ProductSpec): Promise<string> {
  // Best-effort reuse: scan existing products for our metadata tag.
  try {
    const list: any = await dodo.products.list({} as any)
    const items: any[] = list?.items ?? list?.data ?? []
    const match = items.find((p) => p?.metadata?.[META_KEY] === spec.plan)
    if (match?.product_id ?? match?.id) {
      const id = String(match.product_id ?? match.id)
      console.log(`✓ Reusing ${spec.plan} product ${id}`)
      return id
    }
  } catch {
    // Listing failed (or unsupported) — fall through to create.
  }

  const product: any = await dodo.products.create({
    name: spec.name,
    description: spec.description,
    tax_category: 'edtech',
    metadata: { [META_KEY]: spec.plan },
    price: priceFor(spec),
  } as any)

  const id = String(product?.product_id ?? product?.id ?? '')
  if (!id) throw new Error(`Dodo did not return a product id for ${spec.plan}`)
  console.log(`+ Created ${spec.plan} product ${id} (${spec.name})`)
  return id
}

async function main() {
  console.log(`\n🔧 Setting up DodoPayments products for Talkingo (${ENVIRONMENT})…\n`)

  const ids: Record<string, string> = {}
  for (const spec of SPECS) {
    ids[spec.plan] = await ensureProduct(spec)
  }

  console.log('\n✅ Done. Paste these into .env.local:\n')
  console.log(`DODOPAYMENTS_PRODUCT_TRIAL=${ids.trial}`)
  console.log(`DODOPAYMENTS_PRODUCT_MONTHLY=${ids.monthly}`)
  console.log(`DODOPAYMENTS_PRODUCT_YEARLY=${ids.yearly}`)
  console.log(
    '\nNext: enable Adaptive Currency in the Dodo dashboard for localized ' +
      'currency + local payment methods.\n',
  )
}

main().catch((err) => {
  console.error('\n❌ Dodo setup failed:', err?.message || err)
  if (err?.status) console.error('   HTTP status:', err.status)
  process.exit(1)
})
