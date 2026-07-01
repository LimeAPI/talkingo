import { NextRequest, NextResponse } from 'next/server'
import { getSubscription } from '@/lib/appwrite-server'
import { originGuard, rateLimitGuard } from '@/lib/payments/guards'
import { getProvider } from '@/lib/payments/registry'
import { toUnified } from '@/lib/payments/subscription-mapper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/reactivate
 *
 * Provider-agnostic reactivation: undo a scheduled cancellation so the
 * subscription continues past the current period.
 *
 * Flow:
 *   1. originGuard (403) → verifyAuth (401) → rate-limit 5/60s (429)
 *   2. Read the stored subscription and resolve its Payment_Provider via the
 *      back-compat mapper (`toUnified`) + registry (`getProvider`).
 *   3. Eligibility (Req 11.7): reject when the subscription is NOT pending
 *      cancellation (`cancelAtPeriodEnd !== true`) OR its period end has already
 *      passed (now >= periodEnd) — error response, state left unchanged.
 *   4. When eligible (Req 11.5 / 11.6): delegate to `provider.reactivate(...)`
 *      to clear the scheduled cancellation (cancelAtPeriodEnd=false, status stays
 *      active) and return the updated snapshot.
 *
 * _Requirements: 11.5, 11.6, 11.7_
 */
export async function POST(req: NextRequest) {
  try {
    const { verifyAuth } = await import('@/lib/api/auth-guard')

    // 1a. Origin (CSRF) guard → 403
    const originErr = originGuard(req)
    if (originErr) return originErr

    // 1b. Authentication → 401
    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { userId, jwt } = auth

    // 1c. Rate limit 5/60s → 429
    const rlErr = rateLimitGuard(`billing:reactivate:${userId}`, 5, 60_000)
    if (rlErr) return rlErr

    // 2. Resolve the stored subscription and its provider.
    const sub = await getSubscription(userId, jwt)
    const unified = sub ? toUnified(sub) : null
    if (!unified) {
      return NextResponse.json(
        { error: 'no_subscription', message: 'No subscription to reactivate.' },
        { status: 404 }
      )
    }

    // 3. Eligibility (Req 11.7) — reject without contacting the provider so the
    //    stored state is left unchanged.
    const now = Date.now()

    if (unified.cancelAtPeriodEnd !== true) {
      // Not pending cancellation → nothing to undo.
      return NextResponse.json(
        {
          error: 'not_reactivatable',
          message: 'Subscription is not scheduled for cancellation.',
        },
        { status: 409 }
      )
    }

    if (typeof unified.periodEnd === 'number' && now >= unified.periodEnd) {
      // The period has already lapsed — the subscription can no longer be
      // reactivated; the user must subscribe again.
      return NextResponse.json(
        {
          error: 'not_reactivatable',
          message: 'Subscription period has ended and cannot be reactivated.',
        },
        { status: 409 }
      )
    }

    // 4. Eligible → clear the scheduled cancellation via the resolved provider.
    let provider
    try {
      provider = getProvider(unified.provider)
    } catch {
      return NextResponse.json(
        { error: 'provider_unavailable', message: 'Payment provider is not available.' },
        { status: 503 }
      )
    }

    const updated = await provider.reactivate({ userId, jwt })

    return NextResponse.json({
      status: updated.status,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      periodEnd:
        typeof updated.periodEnd === 'number'
          ? new Date(updated.periodEnd).toISOString()
          : null,
    })
  } catch (err: any) {
    console.error('[billing/reactivate] Error:', err?.message)
    return NextResponse.json({ error: 'Failed to reactivate subscription' }, { status: 500 })
  }
}
