import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

/**
 * Check subscription status for a customer.
 * Called on app load to sync subscription state.
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

    const { customerId } = await req.json()

    if (!customerId) {
      // Try to get status from Appwrite DB first (no Stripe API call needed)
      const { getSubscription } = await import('@/lib/appwrite-server')
      const sub = await getSubscription(userId)
      if (sub) {
        return NextResponse.json({
          status: sub.status,
          plan: sub.plan,
          customerId: sub.stripeCustomerId,
          trialEndsAt: sub.trialEnd,
          currentPeriodEnd: sub.periodEnd,
        })
      }
      return NextResponse.json({ status: 'none' })
    }

    // If customerId provided, verify with Stripe (more authoritative)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 1,
    })

    if (subscriptions.data.length === 0) {
      return NextResponse.json({ status: 'none' })
    }

    const sub = subscriptions.data[0]
    return NextResponse.json({
      status: sub.status,
      plan: sub.items.data[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly',
      customerId,
      trialEndsAt: sub.trial_end ? (sub.trial_end as number) * 1000 : undefined,
      currentPeriodEnd: (sub as any).current_period_end ? (sub as any).current_period_end * 1000 : undefined,
    })
  } catch (err: any) {
    console.error('[stripe/status] Error:', err.message)
    return NextResponse.json({ status: 'none' })
  }
}
