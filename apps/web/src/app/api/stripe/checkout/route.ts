import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

/**
 * Creates a Stripe Checkout Session for subscription.
 *
 * Flow:
 * 1. User picks monthly or yearly
 * 2. We create a Checkout Session with:
 *    - $1 one-time charge (trial fee)
 *    - 5-day free trial on the subscription
 *    - After 5 days: auto-charges $7.99/month or $59.99/year
 * 3. User is redirected to Stripe-hosted checkout page
 * 4. After payment, redirected back to app
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil' as any,
})

// Price IDs from Stripe — set in env vars (different for test vs live mode)
const PRICES = {
  trial: process.env.STRIPE_PRICE_TRIAL || 'price_1Tb98sCXJ6FC0otza6g6sh47',
  monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_1Tb96gCXJ6FC0otzKSDetgo7',
  yearly: process.env.STRIPE_PRICE_YEARLY || 'price_1Tb97dCXJ6FC0otzBc4mGW0Q',
}

export async function POST(req: NextRequest) {
  try {
    const { plan, userId, email } = await req.json()

    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    // ── Auth: verify user session and ensure userId matches ──────────────
    const { verifyAuth } = await import('@/lib/api/auth-guard')
    const authenticatedUserId = await verifyAuth(req)
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Use the authenticated userId, not the one from the request body (prevents manipulation)
    const safeUserId = authenticatedUserId

    const priceId = plan === 'yearly' ? PRICES.yearly : PRICES.monthly
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email || undefined,
      metadata: { userId: safeUserId, plan },
      line_items: [
        // $1 trial fee (one-time, charged immediately)
        {
          price: PRICES.trial,
          quantity: 1,
        },
        // Subscription (starts after 5-day trial)
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 5,
        metadata: { userId: safeUserId, plan },
      },
      success_url: `${appUrl}?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}?subscription=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe/checkout] Error:', err.message)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
