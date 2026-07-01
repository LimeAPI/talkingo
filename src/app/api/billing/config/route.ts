import { NextResponse } from 'next/server'
import { providerConfig } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/config
 *
 * Reports which payment providers are enabled. Enablement is derived SOLELY
 * from the provider registry (`providerConfig()`) — this route never reads
 * provider environment variables directly, which is what removes the historical
 * env-var split bug where `config` and `recommend-provider` could disagree.
 *
 * Per Req 3.8: if the registry cannot resolve enablement (it is uninitialized
 * or otherwise unavailable / throws), both providers are reported as disabled
 * and the response carries `resolved: false` to indicate enablement could not
 * be determined.
 *
 * _Requirements: 3.1, 3.8_
 */
export async function GET() {
  try {
    const { stripeEnabled, dodoEnabled } = providerConfig()
    const defaultProvider = dodoEnabled ? 'dodopayments' : 'stripe'
    return NextResponse.json({
      dodoEnabled,
      stripeEnabled,
      defaultProvider,
      resolved: true,
    })
  } catch {
    // Registry unavailable / uninitialized: fail closed by reporting both
    // providers as disabled and signalling that enablement is unresolved.
    return NextResponse.json({
      dodoEnabled: false,
      stripeEnabled: false,
      defaultProvider: 'stripe',
      resolved: false,
    })
  }
}
