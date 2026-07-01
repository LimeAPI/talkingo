import { NextRequest, NextResponse } from 'next/server'
import { originGuard, rateLimitGuard } from '@/lib/payments/guards'
import { getProvider } from '@/lib/payments/registry'
import type { ProviderId, UnifiedSubscription } from '@/lib/payments/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/sync-checkout — provider-agnostic return-from-checkout sync.
 *
 * Called by the browser immediately after a provider redirects back with
 * `?provider=..&status=success&session_id=..`. Pulls the live subscription from
 * the resolved provider and persists it, so the user sees Premium right away
 * regardless of whether the webhook has fired yet ("never lose a payment").
 *
 * Body: { provider: 'stripe' | 'dodopayments', sessionId: string }
 *
 * Runs the shared mutating-route guards (origin → auth → rate-limit at 10/min),
 * validates the provider, resolves it through the registry, and delegates to
 * `provider.syncFromCheckout({ userId, sessionId })`. The provider performs the
 * ownership and tampered-price assertions and persists the snapshot through the
 * shared race-safe `syncToAppwrite` writer.
 *
 * Status contract:
 *   - 403 `forbidden_origin`     → origin missing / not allowlisted (15.x via originGuard)
 *   - 401 `unauthorized`         → no valid authenticated session
 *   - 429 `rate_limited`         → > 10 requests / 60s, with integer Retry-After
 *   - 400 `invalid_provider`     → unknown provider id (6.4)
 *   - 400 `missing_session`      → no sessionId in body
 *   - 503 `provider_unavailable` → provider disabled / misconfigured
 *   - 403 `forbidden`            → session belongs to another user (6.5, 6.10)
 *   - 400 `invalid_price`        → tampered/unknown recurring price (6.10)
 *   - 202 `not_ready`            → payment still pending; webhook will finalize (6.7)
 *   - 200 { ...snapshot }        → confirmed subscription snapshot (6.6, 6.11)
 *
 * Ownership and tampered-price failures are raised by the provider BEFORE any
 * state is written, so a rejected sync never mutates the stored subscription.
 *
 * _Requirements: 6.4, 6.5, 6.6, 6.7, 6.10, 6.11_
 */

/** The set of allowed provider ids (Req 6.4). */
const ALLOWED_PROVIDERS: ProviderId[] = ['stripe', 'dodopayments']

/** Per-user sync budget: more than 10 in a 60s rolling window → 429 (sync 10/min per design). */
const SYNC_RATE_LIMIT = 10
const SYNC_RATE_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  // ── 1. Origin guard ─────────────────────────────────────────────────────────
  const originErr = originGuard(req)
  if (originErr) return originErr

  // ── 2. Authentication ────────────────────────────────────────────────────────
  const { verifyAuth } = await import('@/lib/api/auth-guard')
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401 },
    )
  }
  const { userId } = auth

  // ── 3. Rate limit: > 10 / 60s → 429 + Retry-After ───────────────────────────
  const rlErr = rateLimitGuard(`billing:sync:${userId}`, SYNC_RATE_LIMIT, SYNC_RATE_WINDOW_MS)
  if (rlErr) return rlErr

  // ── 4. Validate provider + sessionId (6.4) ───────────────────────────────────
  const body = (await req.json().catch(() => ({}))) as {
    provider?: string
    sessionId?: string
  }
  const { provider, sessionId } = body

  if (!provider || !ALLOWED_PROVIDERS.includes(provider as ProviderId)) {
    return NextResponse.json(
      { error: 'invalid_provider', message: 'Unsupported payment provider.' },
      { status: 400 },
    )
  }
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json(
      { error: 'missing_session', message: 'sessionId is required.' },
      { status: 400 },
    )
  }

  // ── 5. Resolve provider through the registry ─────────────────────────────────
  // A disabled/misconfigured provider surfaces as a "not configured" error → 503;
  // any other resolution failure is a bad provider id → 400.
  let resolved
  try {
    resolved = getProvider(provider as ProviderId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('not configured')) {
      return NextResponse.json(
        { error: 'provider_unavailable', message: 'The selected payment provider is unavailable.' },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: 'invalid_provider', message: 'Unsupported payment provider.' },
      { status: 400 },
    )
  }

  // ── 6. Sync the returned checkout (6.5, 6.6, 6.7, 6.10, 6.11) ────────────────
  // The provider asserts ownership + a known recurring price and persists the
  // confirmed snapshot via the shared race-safe `syncToAppwrite` writer. It
  // returns `null` while payment is still pending (SCA/3DS not finished).
  try {
    const snapshot: UnifiedSubscription | null = await resolved.syncFromCheckout({
      userId,
      sessionId,
    })

    if (!snapshot) {
      // Payment not yet confirmed — the webhook will finalize it (6.7).
      return NextResponse.json(
        { error: 'not_ready', message: 'Subscription is not ready yet.' },
        { status: 202 },
      )
    }

    // Confirmed — return the provider-agnostic snapshot (6.6, 6.11).
    return NextResponse.json({
      provider: snapshot.provider,
      status: snapshot.status,
      plan: snapshot.plan,
      providerCustomerId: snapshot.providerCustomerId,
      providerSubscriptionId: snapshot.providerSubscriptionId,
      trialEnd: snapshot.trialEnd,
      periodEnd: snapshot.periodEnd,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      updatedAt: snapshot.updatedAt,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''

    // Ownership mismatch — another user's paid session (6.5, 6.10). No state change.
    if (msg.includes('does not belong')) {
      return NextResponse.json(
        { error: 'forbidden', message: 'This checkout session belongs to another account.' },
        { status: 403 },
      )
    }

    // Tampered / unknown recurring price (6.10). No state change.
    if (msg.includes('Invalid subscription price')) {
      return NextResponse.json(
        { error: 'invalid_price', message: 'The checkout session references an invalid price.' },
        { status: 400 },
      )
    }

    console.error('[billing/sync-checkout] syncFromCheckout failed:', msg || err)
    return NextResponse.json(
      { error: 'sync_failed', message: 'Could not confirm the subscription.' },
      { status: 500 },
    )
  }
}
