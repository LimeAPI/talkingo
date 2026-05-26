import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

/**
 * Retrieve a Checkout Session to get customer ID after successful payment.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil' as any,
})

export async function POST(req: NextRequest) {
  try {
    // ── Auth: verify user has a valid session ────────────────────────────
    const { verifyAuth } = await import('@/lib/api/auth-guard')
    const userId = await verifyAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await req.json()
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    return NextResponse.json({
      customerId: session.customer as string,
      plan: session.metadata?.plan || 'monthly',
      subscriptionId: session.subscription as string,
    })
  } catch (err: any) {
    console.error('[stripe/session] Error:', err.message)
    return NextResponse.json({ error: 'Failed to retrieve session' }, { status: 500 })
  }
}
