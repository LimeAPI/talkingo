import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

/**
 * Creates a Stripe Customer Portal session.
 * User can manage their subscription (cancel, upgrade, update payment method).
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil' as any,
})

export async function POST(req: NextRequest) {
  try {
    const { customerId } = await req.json()

    if (!customerId) {
      return NextResponse.json({ error: 'customerId required' }, { status: 400 })
    }

    // ── Auth: verify user has a valid session ────────────────────────────
    const { verifyAuth } = await import('@/lib/api/auth-guard')
    const userId = await verifyAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: appUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe/portal] Error:', err.message)
    return NextResponse.json({ error: 'Failed to open billing portal' }, { status: 500 })
  }
}
