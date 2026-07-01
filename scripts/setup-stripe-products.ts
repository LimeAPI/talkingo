/**
 * Idempotent Stripe product/price setup for the Talkingo web app.
 *
 * Run with:
 *   npm run stripe:setup
 *
 * Creates (or reuses, via stable `lookup_key`s) the three prices the app needs:
 *   - talkingo_trial   → $5.00 one-time   (5-day trial fee → STRIPE_PRICE_TRIAL)
 *   - talkingo_monthly → $30.00/month      (recurring     → STRIPE_PRICE_MONTHLY)
 *   - talkingo_yearly  → $360.00/year      (recurring     → STRIPE_PRICE_YEARLY)
 *
 * All prices hang off a single "Talkingo Premium" product. Re-runs are safe:
 * existing prices are matched by `lookup_key` and reused, never duplicated.
 *
 * Reads STRIPE_SECRET_KEY from .env.local (loaded via Node's --env-file flag).
 * Prints the resolved price IDs at the end so you can paste them into .env.local.
 */

import Stripe from 'stripe'

const SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!SECRET_KEY || !SECRET_KEY.startsWith('sk_')) {
  console.error(
    '\n❌ Missing/invalid STRIPE_SECRET_KEY. Set it in .env.local before running this script.\n',
  )
  process.exit(1)
}

const stripe = new Stripe(SECRET_KEY)

const PRODUCT_NAME = 'Talkingo Premium'
const PRODUCT_METADATA_KEY = 'talkingo_app'
const PRODUCT_METADATA_VALUE = 'premium'

interface PriceSpec {
  lookupKey: string
  nickname: string
  unitAmount: number // in cents
  recurring?: { interval: 'month' | 'year' }
}

const PRICE_SPECS: PriceSpec[] = [
  {
    lookupKey: 'talkingo_trial',
    nickname: '5-Day Trial (one-time $5)',
    unitAmount: 500,
  },
  {
    lookupKey: 'talkingo_monthly',
    nickname: 'Monthly ($30/mo)',
    unitAmount: 3000,
    recurring: { interval: 'month' },
  },
  {
    lookupKey: 'talkingo_yearly',
    nickname: 'Yearly ($360/yr)',
    unitAmount: 36000,
    recurring: { interval: 'year' },
  },
]

/** Find the existing premium product (by metadata tag) or create it. */
async function ensureProduct(): Promise<Stripe.Product> {
  // Search is the most reliable way to find by metadata; fall back to list.
  const existing = await stripe.products.list({ active: true, limit: 100 })
  const match = existing.data.find(
    (p) => p.metadata?.[PRODUCT_METADATA_KEY] === PRODUCT_METADATA_VALUE,
  )
  if (match) {
    console.log(`✓ Reusing product ${match.id} ("${match.name}")`)
    return match
  }

  const product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: 'Talkingo Premium — unlimited AI language practice.',
    metadata: { [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE },
  })
  console.log(`+ Created product ${product.id} ("${product.name}")`)
  return product
}

/** Find a price by lookup_key or create it under the given product. */
async function ensurePrice(productId: string, spec: PriceSpec): Promise<Stripe.Price> {
  const found = await stripe.prices.list({
    lookup_keys: [spec.lookupKey],
    active: true,
    limit: 1,
  })
  if (found.data[0]) {
    const p = found.data[0]
    console.log(`✓ Reusing price ${p.id} [${spec.lookupKey}]`)
    return p
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: spec.unitAmount,
    nickname: spec.nickname,
    lookup_key: spec.lookupKey,
    ...(spec.recurring ? { recurring: spec.recurring } : {}),
  })
  console.log(`+ Created price ${price.id} [${spec.lookupKey}] (${spec.nickname})`)
  return price
}

async function main() {
  console.log('\n🔧 Setting up Stripe products/prices for Talkingo…\n')

  const product = await ensureProduct()

  const byKey: Record<string, string> = {}
  for (const spec of PRICE_SPECS) {
    const price = await ensurePrice(product.id, spec)
    byKey[spec.lookupKey] = price.id
  }

  console.log('\n✅ Done. Paste these into .env.local:\n')
  console.log(`STRIPE_PRICE_TRIAL=${byKey['talkingo_trial']}`)
  console.log(`STRIPE_PRICE_MONTHLY=${byKey['talkingo_monthly']}`)
  console.log(`STRIPE_PRICE_YEARLY=${byKey['talkingo_yearly']}`)
  console.log(
    '\nNext: create a webhook endpoint (Dashboard → Developers → Webhooks or\n' +
      '`stripe listen`) and set STRIPE_WEBHOOK_SECRET.\n',
  )
}

main().catch((err) => {
  console.error('\n❌ Stripe setup failed:', err?.message || err)
  process.exit(1)
})
