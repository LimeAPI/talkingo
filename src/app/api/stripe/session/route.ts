import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Retrieve a Checkout Session to get customer ID after successful payment.
 *
 * Security: only the user who initiated the session (matched via metadata.userId)
 * can read it back. Prevents one user from inspecting another's checkout session.
 */

export async function POST(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────
    const { verifyAuth, checkRateLimit, validateOrigin } = await import('@/lib/api/auth-guard')

    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
    }

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = auth.userId

    const rl = checkRateLimit(`stripe:session:${userId}`, 10, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    const { sessionId } = await req.json()
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // Ownership check: the session must belong to the authenticated user
    if (session.metadata?.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
