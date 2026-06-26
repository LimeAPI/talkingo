import { NextRequest, NextResponse } from 'next/server'
import { getSubscription } from '@/lib/appwrite-server'
import { toUnified } from '@/lib/payments/subscription-mapper'
import { getProvider } from '@/lib/payments/registry'
import type { UnifiedSubscription } from '@/lib/payments/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Provider-agnostic subscription status for the authenticated user.
 *
 * This is the endpoint `use-subscription`'s `hydrateFromServer` POSTs to on app
 * load and during cross-device re-hydration. It resolves the provider from the
 * stored subscription's canonical `provider` field, asks that provider for the
 * authoritative state, and shapes the response so the client hook can read it.
 *
 * Security: only ever reads the subscription owned by the authenticated user
 * (looked up with their JWT). The client cannot pass an arbitrary customerId.
 *
 * _Requirements: 14.3, 14.6_
 */

/** Shape a canonical `UnifiedSubscription` into the JSON the client hook reads. */
function toClientShape(s: UnifiedSubscription) {
  return {
    status: s.status,
    plan: s.plan,
    customerId: s.providerCustomerId,
    trialEndsAt: s.trialEnd,
    currentPeriodEnd: s.periodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
    provider: s.provider,
  }
}

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
    const { userId, jwt } = auth

    const rl = checkRateLimit(`billing:status:${userId}`, 30, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    // Body is optional and ignored — we always look up the subscription owned
    // by this user for security.
    try { await req.json() } catch { /* empty body is fine */ }

    // Source of truth: Appwrite subscriptions collection. Read as the user
    // (their JWT) so we never leak another user's row. If that read returns
    // nothing, fall back to an admin read scoped to THIS authenticated user's
    // id — this is safe (we never read another user's row) and makes status
    // robust against a misconfigured collection where webhook/admin-created
    // documents aren't readable under the user's own permissions.
    let sub = await getSubscription(userId, jwt)
    if (!sub) {
      const adminRead = await getSubscription(userId).catch(() => null)
      if (adminRead) sub = adminRead
    }

    // 14.6: no stored subscription → no active subscription, no premium granted.
    if (!sub) {
      return NextResponse.json({ status: 'none' })
    }

    // Derive the canonical snapshot (canonical-first, legacy-fallback). Returns
    // null for unresolvable / unknown-provider documents.
    const stored = toUnified(sub)
    if (!stored) {
      return NextResponse.json({ status: 'none' })
    }

    // 14.3: resolve the provider from the canonical `provider` field and return
    // the authoritative state from the provider.
    try {
      const provider = getProvider(stored.provider)
      const authoritative = await provider.getStatus({ userId, jwt })
      if (authoritative) {
        return NextResponse.json(toClientShape(authoritative))
      }
      // Provider has no live record — fall back to the stored snapshot.
      return NextResponse.json(toClientShape(stored))
    } catch (providerErr: any) {
      // Provider resolution failed (e.g. disabled) or the live lookup errored —
      // fall back to the stored canonical snapshot rather than erroring.
      console.warn(
        '[billing/status] Provider lookup failed, using stored snapshot:',
        providerErr?.message
      )
      return NextResponse.json(toClientShape(stored))
    }
  } catch (err: any) {
    console.error('[billing/status] Error:', err?.message)
    return NextResponse.json({ status: 'none' })
  }
}
