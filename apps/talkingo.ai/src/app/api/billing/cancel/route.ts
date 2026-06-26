import { NextRequest, NextResponse } from 'next/server'
import { getSubscription } from '@/lib/appwrite-server'
import { toUnified } from '@/lib/payments/subscription-mapper'
import { getProvider } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/cancel
 *
 * Provider-agnostic cancellation. Schedules cancellation at period end while
 * keeping the subscription `active` (Requirement 11.1). Only a subscription
 * whose status is `active` AND that is not already scheduled to cancel at
 * period end is eligible — otherwise the request is rejected and state is left
 * unchanged (Requirement 11.2). On success returns `{ cancelAtPeriodEnd: true,
 * periodEnd }` where `periodEnd` is an ISO-8601 UTC timestamp (Requirement 11.3).
 *
 * The route never touches a payment SDK directly: it resolves the stored
 * subscription's provider through the registry and delegates to
 * `provider.cancel(...)`.
 */
export async function POST(req: NextRequest) {
  try {
    const { verifyAuth, checkRateLimit, validateOrigin } = await import('@/lib/api/auth-guard')

    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
    }

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { userId, jwt } = auth

    const rl = checkRateLimit(`billing:cancel:${userId}`, 5, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    // Read the stored subscription and resolve its provider via the mapper.
    const sub = await getSubscription(userId, jwt)
    const unified = sub ? toUnified(sub) : null
    if (!unified) {
      return NextResponse.json(
        { error: 'no_subscription', message: 'No subscription to cancel.' },
        { status: 404 }
      )
    }

    // Eligibility (Req 11.2): only `active` and not already scheduled to cancel.
    if (unified.status !== 'active' || unified.cancelAtPeriodEnd) {
      return NextResponse.json(
        {
          error: 'not_eligible',
          message: 'This subscription is not eligible for cancellation.',
        },
        { status: 409 }
      )
    }

    // Delegate to the resolved provider (throws if unknown/disabled).
    const provider = getProvider(unified.provider)
    const result = await provider.cancel({ userId, jwt })

    // Convert the epoch-ms period end to ISO-8601 UTC (Req 11.3).
    const periodEnd =
      typeof result.periodEnd === 'number' && Number.isFinite(result.periodEnd)
        ? new Date(result.periodEnd).toISOString()
        : null

    return NextResponse.json({
      cancelAtPeriodEnd: true,
      periodEnd,
    })
  } catch (err: any) {
    console.error('[billing/cancel] Error:', err?.message)
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 })
  }
}
