import type { NextRequest } from 'next/server'
import { dodoProvider } from '@/lib/payments/dodo-provider'
import { handleWebhook } from '@/lib/payments/webhook-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DodoPayments webhook route.
 *
 * Thin shell over the single provider-agnostic `handleWebhook` path so Dodo and
 * Stripe verify, de-duplicate, apply, and dead-letter identically. It reads the
 * RAW request body (Req 15.6) and the Standard Webhooks signature header; the
 * Dodo provider's `verifyWebhook` reads `webhook-id` / `webhook-timestamp` /
 * `webhook-signature` from the forwarded headers and throws when the signing
 * secret is missing — so a misconfiguration surfaces as a 400 with no state
 * change. Webhook routes are exempt from origin/CSRF checks; they're
 * authenticated by signature (Req 15.5).
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10, 15.5, 15.6_
 */
export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text()
  const signature = req.headers.get('webhook-signature')

  return handleWebhook(dodoProvider, rawBody, signature, req.headers)
}
