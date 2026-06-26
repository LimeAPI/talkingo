import { NextRequest, NextResponse } from 'next/server'
import { stripeProvider } from '@/lib/payments/stripe-provider'
import { handleWebhook } from '@/lib/payments/webhook-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stripe webhook route.
 *
 * This route is a thin shell: it reads the RAW request body (Req 15.6), grabs
 * the `stripe-signature` header, and delegates everything else (signature
 * verification, idempotency, the apply step, dead-lettering, and the 10s
 * response budget) to the single provider-agnostic `handleWebhook` path so
 * Stripe and Dodo behave identically. Webhook routes are exempt from
 * origin/CSRF checks — they're authenticated by signature (Req 15.5).
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10, 15.5, 15.6_
 */
export async function POST(req: NextRequest): Promise<Response> {
  // Safety guard: prevent processing Stripe events against a LOCAL developer
  // database. We only skip when actually running `next dev` locally
  // (NODE_ENV === 'development'), and even then we log a loud warning so a
  // missed activation is never silent. Anything that isn't a local dev box
  // (production, preview, staging, or a custom server that doesn't set
  // NODE_ENV) processes the webhook normally — Stripe's webhook-secret + the
  // namespaced idempotency store already isolate test vs live deliveries.
  //
  // Set STRIPE_ALLOW_TEST_WEBHOOKS=true to also process while developing
  // locally (e.g. when forwarding events with the Stripe CLI).
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.STRIPE_ALLOW_TEST_WEBHOOKS !== 'true'
  ) {
    console.warn(
      '[webhook:stripe] SKIPPED in local development. Subscriptions will only ' +
        'activate via return-from-checkout sync. Set STRIPE_ALLOW_TEST_WEBHOOKS=true ' +
        'to process forwarded events locally.',
    )
    return NextResponse.json({ received: true, skipped: true })
  }

  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')

  return handleWebhook(stripeProvider, rawBody, sig, req.headers)
}
