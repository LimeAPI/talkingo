import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DodoPayments Webhook handler.
 *
 * Not yet configured — returns 200 to acknowledge all incoming webhooks.
 * When DODO_PAYMENTS_WEBHOOK_SECRET is set and @dodopayments/nextjs is
 * installed, replace with the proper Webhooks() handler.
 */
export async function POST(req: NextRequest) {
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_SECRET

  if (!webhookKey) {
    // DodoPayments not yet configured — acknowledge the webhook silently
    return NextResponse.json({ received: true, skipped: true })
  }

  // DodoPayments is configured — verify signature and process
  try {
    const body = await req.text()
    const sig = req.headers.get('dodo-webhook-signature')

    console.log('[DodoPayments] Webhook received, signature present:', !!sig)
    console.log('[DodoPayments] Body preview:', body.slice(0, 200))

    // TODO: verify signature with webhookKey and process events
    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[DodoPayments] Webhook error:', err.message)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}