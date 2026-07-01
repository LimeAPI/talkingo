import { NextRequest } from 'next/server'
import { POST as billingSyncCheckout } from '@/app/api/billing/sync-checkout/route'
import { forwardToBillingAsStripe } from '@/lib/payments/stripe-shim'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DEPRECATED thin shim → POST /api/billing/sync-checkout.
 *
 * Kept for backward compatibility during the unified-payments rollout. Contains
 * no Stripe SDK logic (Req 1.4): it injects `provider: 'stripe'` into the body
 * (legacy callers pass only `{ sessionId }`) and delegates to the
 * provider-agnostic return-from-checkout sync route, which resolves the Stripe
 * provider through the registry and performs the ownership / tampered-price
 * assertions before persisting.
 *
 * New clients should call `/api/billing/sync-checkout` directly with an
 * explicit `provider`.
 */
export async function POST(req: NextRequest) {
  return forwardToBillingAsStripe(req, billingSyncCheckout)
}
