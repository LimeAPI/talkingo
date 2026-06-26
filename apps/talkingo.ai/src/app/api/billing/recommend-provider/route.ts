import { NextRequest, NextResponse } from 'next/server'
import { providerConfig } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Smart payment provider recommendation.
 *
 * Returns the best provider for a given country/locale, plus a full
 * payment-method matrix for both providers so the client can show a
 * transparent "here's what each option supports" picker.
 *
 * Routing rationale (kept simple and explainable):
 *   - India:           Dodo preferred (UPI/netbanking/wallets — Stripe doesn't
 *                      support UPI; cards via Stripe available as fallback)
 *   - US/CA/GB/EU/AU/JP/ZA/NZ/SG/HK/KR:  Stripe preferred (Link, Apple Pay,
 *                      Google Pay, SEPA, iDEAL etc.)
 *   - Everywhere else: Dodo preferred (better emerging-market coverage)
 *
 * The user can ALWAYS override our recommendation manually.
 */

type Provider = 'stripe' | 'dodopayments'

interface PaymentMethod {
  id: string
  label: string
  icon: string // emoji or short string for the client to render
}

const STRIPE_METHODS_BY_REGION: Record<string, PaymentMethod[]> = {
  // Always-available card payments
  default: [
    { id: 'card', label: 'Credit / debit card', icon: '💳' },
    { id: 'apple_pay', label: 'Apple Pay', icon: '🍎' },
    { id: 'google_pay', label: 'Google Pay', icon: '🟢' },
  ],
  US: [], UK: [], CA: [], AU: [], NZ: [], SG: [], HK: [], JP: [], KR: [], ZA: [],
}

STRIPE_METHODS_BY_REGION.US.push({ id: 'link', label: 'Link', icon: '🔗' })

const DODO_METHODS_BY_REGION: Record<string, PaymentMethod[]> = {
  // Sensible global default so Dodo is never shown as an empty option. The
  // hosted checkout ultimately offers every method enabled for the brand that
  // is available in the customer's region; this list is the transparent
  // "what you can expect" preview the picker renders.
  default: [
    { id: 'card', label: 'Credit / debit card', icon: '💳' },
    { id: 'apple_pay', label: 'Apple Pay', icon: '🍎' },
    { id: 'google_pay', label: 'Google Pay', icon: '🟢' },
  ],
}

// India: UPI, netbanking, wallets
DODO_METHODS_BY_REGION['IN'] = [
  { id: 'upi', label: 'UPI (GPay, PhonePe, Paytm)', icon: '⚡' },
  { id: 'card', label: 'Credit / debit card', icon: '💳' },
  { id: 'netbanking', label: 'Net banking', icon: '🏦' },
  { id: 'wallets', label: 'Wallets', icon: '👛' },
]

// Bangladesh, Pakistan, Sri Lanka, Nepal — UPI-adjacent regions get similar
DODO_METHODS_BY_REGION['BD'] = DODO_METHODS_BY_REGION['IN']
DODO_METHODS_BY_REGION['PK'] = DODO_METHODS_BY_REGION['IN']
DODO_METHODS_BY_REGION['LK'] = DODO_METHODS_BY_REGION['IN']
DODO_METHODS_BY_REGION['NP'] = DODO_METHODS_BY_REGION['IN']

// SE Asia: cards + regional wallets
DODO_METHODS_BY_REGION['TH'] = [
  { id: 'card', label: 'Credit / debit card', icon: '💳' },
  { id: 'promptpay', label: 'PromptPay', icon: '⚡' },
]
DODO_METHODS_BY_REGION['MY'] = [
  { id: 'card', label: 'Credit / debit card', icon: '💳' },
  { id: 'fpx', label: 'FPX (online banking)', icon: '🏦' },
]
DODO_METHODS_BY_REGION['PH'] = [
  { id: 'card', label: 'Credit / debit card', icon: '💳' },
  { id: 'gcash', label: 'GCash', icon: '📱' },
]
DODO_METHODS_BY_REGION['ID'] = [
  { id: 'card', label: 'Credit / debit card', icon: '💳' },
  { id: 'ewallet', label: 'E-Wallet', icon: '👛' },
]
DODO_METHODS_BY_REGION['VN'] = [
  { id: 'card', label: 'Credit / debit card', icon: '💳' },
]

// Middle East: cards + Mada/Knet
DODO_METHODS_BY_REGION['SA'] = [
  { id: 'card', label: 'Credit / debit card', icon: '💳' },
  { id: 'mada', label: 'mada', icon: '🏦' },
  { id: 'apple_pay', label: 'Apple Pay', icon: '🍎' },
]
DODO_METHODS_BY_REGION['AE'] = [
  { id: 'card', label: 'Credit / debit card', icon: '💳' },
  { id: 'apple_pay', label: 'Apple Pay', icon: '🍎' },
]
DODO_METHODS_BY_REGION['KW'] = [{ id: 'card', label: 'Credit / debit card', icon: '💳' }, { id: 'knet', label: 'Knet', icon: '🏦' }]

// LatAm: cards + local methods
DODO_METHODS_BY_REGION['BR'] = [
  { id: 'card', label: 'Credit / debit card', icon: '💳' },
  { id: 'pix', label: 'PIX', icon: '⚡' },
  { id: 'boleto', label: 'Boleto', icon: '🧾' },
]
DODO_METHODS_BY_REGION['MX'] = [{ id: 'card', label: 'Credit / debit card', icon: '💳' }]
DODO_METHODS_BY_REGION['AR'] = [{ id: 'card', label: 'Credit / debit card', icon: '💳' }]
DODO_METHODS_BY_REGION['CL'] = [{ id: 'card', label: 'Credit / debit card', icon: '💳' }]
DODO_METHODS_BY_REGION['CO'] = [{ id: 'card', label: 'Credit / debit card', icon: '💳' }]
DODO_METHODS_BY_REGION['PE'] = [{ id: 'card', label: 'Credit / debit card', icon: '💳' }]

// Africa
DODO_METHODS_BY_REGION['NG'] = [{ id: 'card', label: 'Credit / debit card', icon: '💳' }]
DODO_METHODS_BY_REGION['KE'] = [{ id: 'card', label: 'Credit / debit card', icon: '💳' }, { id: 'mpesa', label: 'M-Pesa', icon: '📱' }]

/**
 * Countries where Stripe has the best coverage (cards + wallets + bank debits).
 * Anywhere outside this set defaults to Dodo.
 */
const STRIPE_FIRST_COUNTRIES = new Set([
  'US', 'CA', 'GB', 'IE', 'AU', 'NZ',
  'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'FI', 'GR',
  'SE', 'NO', 'DK', 'CH', 'PL', 'CZ',
  'JP', 'SG', 'HK', 'KR', 'TW',
  'ZA',
])

/**
 * India is the canonical "Dodo-first" country because UPI is unmatched.
 * Other countries fall through to the default heuristic.
 */
const DODO_FIRST_COUNTRIES = new Set(['IN', 'BD', 'PK', 'LK', 'NP', 'TH', 'MY', 'PH', 'ID', 'VN', 'SA', 'AE', 'KW', 'BR', 'MX', 'AR', 'CL', 'CO', 'PE', 'NG', 'KE'])

function recommendProvider(country: string | null, currency: string | null): Provider {
  const c = (country || '').toUpperCase()
  const cur = (currency || '').toUpperCase()

  if (DODO_FIRST_COUNTRIES.has(c)) return 'dodopayments'
  if (STRIPE_FIRST_COUNTRIES.has(c)) return 'stripe'
  // Currency-based fallback: INR → Dodo
  if (cur === 'INR') return 'dodopayments'
  // Default: Stripe (broader global coverage)
  return 'stripe'
}

function getMethods(table: Record<string, PaymentMethod[]>, country: string): PaymentMethod[] {
  const c = (country || '').toUpperCase()
  return table[c] ?? table.default ?? []
}

export async function POST(req: NextRequest) {
  // No auth required — this is a public recommendation endpoint.
  // It only returns non-sensitive capability metadata.
  try {
    const body = await req.json().catch(() => ({}))
    const rawCountry = body?.country
    const rawCurrency = body?.currency

    // Validate ISO codes (Req 4.2). Reject missing/empty/invalid country or
    // currency with a 400 and DO NOT return a recommended provider.
    if (!isValidCountry(rawCountry)) {
      return NextResponse.json(
        { error: 'invalid_country', field: 'country', message: 'country must be a valid ISO 3166-1 alpha-2 code' },
        { status: 400 },
      )
    }
    if (!isValidCurrency(rawCurrency)) {
      return NextResponse.json(
        { error: 'invalid_currency', field: 'currency', message: 'currency must be a valid ISO 4217 currency code' },
        { status: 400 },
      )
    }

    const country = (rawCountry as string).toUpperCase()
    const currency = (rawCurrency as string).toUpperCase()

    // Enablement comes solely from the registry (Req 3.2). If it cannot be
    // resolved, both providers are treated as disabled (Req 3.8).
    const { stripeEnabled, dodoEnabled, resolved } = resolveEnablement()

    // Regional heuristic: UPI regions → Dodo, broad-card regions → Stripe.
    const heuristic = recommendProvider(country, currency)

    // The recommendation must respect enablement (Req 4.5): never recommend a
    // disabled provider. Prefer the heuristic choice when enabled, otherwise
    // fall back to the other provider when it is enabled, otherwise empty.
    let recommended = ''
    if (heuristic === 'stripe') {
      recommended = stripeEnabled ? 'stripe' : dodoEnabled ? 'dodopayments' : ''
    } else {
      recommended = dodoEnabled ? 'dodopayments' : stripeEnabled ? 'stripe' : ''
    }

    return NextResponse.json({
      recommended,
      // Both providers are always listed so the UI can show the matrix; each
      // carries its enabled flag and (when enabled) its regional methods.
      providers: {
        stripe: {
          enabled: stripeEnabled,
          methods: stripeEnabled ? getMethods(STRIPE_METHODS_BY_REGION, country) : [],
        },
        dodopayments: {
          enabled: dodoEnabled,
          methods: dodoEnabled ? getMethods(DODO_METHODS_BY_REGION, country) : [],
        },
      },
      region: { country, currency },
      // Surfaced so callers know enablement could not be resolved (Req 3.8).
      enablementResolved: resolved,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'bad request' }, { status: 400 })
  }
}

export async function GET() {
  // GET cannot supply validated country/currency codes, so it must not
  // fabricate a recommendation. It returns the same validation error a POST
  // with no codes would produce (Req 4.2) rather than bypassing validation.
  return POST(new NextRequest('http://local/recommend', { method: 'POST', body: JSON.stringify({}) }))
}

// ─────────────────────────────────────────────────────────────────────────
// ISO code validation (Req 4.2). A country must be a valid ISO 3166-1 alpha-2
// code and a currency must be a valid ISO 4217 alpha-3 code. We validate both
// the format (regex) and membership in the known set.
// ─────────────────────────────────────────────────────────────────────────

const ISO_3166_ALPHA2 = new Set([
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU',
  'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL',
  'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC',
  'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV',
  'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG',
  'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD',
  'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT',
  'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM',
  'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH',
  'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK',
  'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH',
  'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW',
  'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR',
  'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR',
  'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC',
  'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL',
  'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY',
  'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA',
  'ZM', 'ZW',
])

const ISO_4217_CURRENCIES = new Set([
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM',
  'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN',
  'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP',
  'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD',
  'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL',
  'HRK', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD',
  'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK',
  'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT',
  'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO',
  'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
  'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD',
  'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS',
  'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'UYU',
  'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XOF', 'XPF', 'YER',
  'ZAR', 'ZMW', 'ZWL',
])

function isValidCountry(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Za-z]{2}$/.test(code) && ISO_3166_ALPHA2.has(code.toUpperCase())
}

function isValidCurrency(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Za-z]{3}$/.test(code) && ISO_4217_CURRENCIES.has(code.toUpperCase())
}

/**
 * Resolve provider enablement from the registry (single source of truth).
 * Per Req 3.2 we never read provider env vars directly here. Per Req 3.8, if
 * enablement cannot be resolved (registry uninitialized/unavailable), we treat
 * both providers as disabled and signal that resolution failed.
 */
function resolveEnablement(): { stripeEnabled: boolean; dodoEnabled: boolean; resolved: boolean } {
  try {
    const { stripeEnabled, dodoEnabled } = providerConfig()
    return { stripeEnabled, dodoEnabled, resolved: true }
  } catch {
    return { stripeEnabled: false, dodoEnabled: false, resolved: false }
  }
}
