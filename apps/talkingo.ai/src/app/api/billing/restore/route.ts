import { NextRequest, NextResponse } from 'next/server'
import { originGuard, rateLimitGuard } from '@/lib/payments/guards'
import { enabledProviders } from '@/lib/payments/registry'
import { getSubscription } from '@/lib/appwrite-server'
import { toUnified } from '@/lib/payments/subscription-mapper'
import type { PaymentProvider, UnifiedSubscription } from '@/lib/payments/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/restore — user-facing "restore purchase" / recover a
 * paid-but-not-activated subscription.
 *
 * The hard case in any SaaS billing flow: the user paid at the provider, but
 * the activation never reached us (the webhook was missed/skipped AND the
 * return-from-checkout sync was interrupted — e.g. the browser was closed on
 * the provider's success page). The provider has an active subscription; our
 * row is still `incomplete` (or already carries the customer id from the
 * pre-checkout write), so the app shows no Premium.
 *
 * This route lets the user self-heal: for every enabled provider it asks
 * `adoptExistingSubscription`, which lists the user's LIVE subscriptions at the
 * provider (keyed off the customer id we stored when checkout began) and, if it
 * finds an access-granting one, re-persists the authoritative state through the
 * shared race-safe `syncToAppwrite` writer. No new charge is ever created.
 *
 * It is safe to call repeatedly (idempotent) and never creates a subscription —
 * it only re-reads and persists what the provider already has.
 *
 * Status contract:
 *   - 403 `forbidden_origin`   → origin missing / not allowlisted (via originGuard)
 *   - 401 `unauthorized`       → no valid authenticated session
 *   - 429 `rate_limited`       → > 5 requests / 60s, integer Retry-After
 *   - 200 { restored: true, ...snapshot } → a live subscription was recovered
 *   - 200 { restored: false, status }      → nothing to restore (with current status)
 */

/** Per-user restore budget: > 5 within 60s → 429. */
const RESTORE_RATE_LIMIT = 5
const RESTORE_RATE_WINDOW_MS = 60_000

/** A status that grants Premium access. */
function isLive(status: string | undefined): boolean {
  return status === 'active' || status === 'trialing'
}

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
  // ── 1. Origin guard ──────────────────────────────────────────────────────
  const originErr = originGuard(req)
  if (originErr) return originErr

  // ── 2. Authentication ────────────────────────────────────────────────────
  const { verifyAuth } = await import('@/lib/api/auth-guard')
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401 },
    )
  }
  const { userId, jwt } = auth

  // ── 3. Rate limit: > 5 / 60s → 429 + Retry-After ──────────────────────────
  const rlErr = rateLimitGuard(
    `billing:restore:${userId}`,
    RESTORE_RATE_LIMIT,
    RESTORE_RATE_WINDOW_MS,
  )
  if (rlErr) return rlErr

  // ── 4. Try to adopt a live subscription from each enabled provider ─────────
  // We order the user's own stored provider first (when known) so the most
  // likely match is checked before the others. Each `adoptExistingSubscription`
  // is best-effort and never throws — a provider hiccup can't break restore.
  const stored = await getSubscription(userId, jwt).catch(() => null)
  const storedProvider = stored ? toUnified(stored)?.provider : undefined

  const providers = enabledProviders().sort((a, b) => {
    if (a.id === storedProvider) return -1
    if (b.id === storedProvider) return 1
    return 0
  })

  for (const provider of providers as PaymentProvider[]) {
    if (typeof provider.adoptExistingSubscription !== 'function') continue
    try {
      const adopted = await provider.adoptExistingSubscription({ userId, jwt })
      if (adopted && isLive(adopted.status)) {
        return NextResponse.json({ restored: true, ...toClientShape(adopted) })
      }
    } catch (err) {
      // Best-effort per provider — log and keep trying the others.
      console.warn(
        `[billing/restore] ${provider.id} adopt failed:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  // ── 5. Nothing live to restore — report the current stored status ──────────
  // This is not an error: the user may simply not have an active subscription
  // (never paid, or it genuinely expired/cancelled). Returning the current
  // status lets the client message appropriately without implying a failure.
  const currentStatus = stored ? (toUnified(stored)?.status ?? 'none') : 'none'
  return NextResponse.json({ restored: false, status: currentStatus })
}
