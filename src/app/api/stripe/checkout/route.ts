import { NextRequest } from 'next/server'
import { POST as billingCheckout } from '@/app/api/billing/checkout/route'
import { forwardToBillingAsStripe } from '@/lib/payments/stripe-shim'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DEPRECATED thin shim → POST /api/billing/checkout.
 *
 * Kept for backward compatibility during the unified-payments rollout. This
 * route no longer contains any Stripe SDK logic (Req 1.4): it injects
 * `provider: 'stripe'` into the request body and delegates to the
 * provider-agnostic checkout route, which resolves the Stripe provider through
 * the registry and runs all guards (origin → auth → rate-limit → double-sub).
 *
 * New clients should call `/api/billing/checkout` directly with an explicit
 * `provider`.
 */
export async function POST(req: NextRequest) {
  return forwardToBillingAsStripe(req, billingCheckout)
}
