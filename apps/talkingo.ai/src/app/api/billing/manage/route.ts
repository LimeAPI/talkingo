import { NextRequest, NextResponse } from 'next/server'
import { originGuard, rateLimitGuard } from '@/lib/payments/guards'
import { getProvider } from '@/lib/payments/registry'
import { getSubscription } from '@/lib/appwrite-server'
import { toUnified } from '@/lib/payments/subscription-mapper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/manage — provider-agnostic billing/payment-method surface.
 *
 * Resolves the Payment_Provider from the user's STORED subscription (canonical
 * `provider` field, legacy fallback) via the subscription mapper — never from
 * input — and delegates to that provider's `getManageUrl`, which mints a
 * managed billing / payment-method-update URL (Stripe Customer Portal or Dodo
 * hosted portal). The resolved URL is returned as `{ url }` within 5 seconds.
 *
 * Status contract:
 *   - 403 `forbidden_origin`   → origin missing / not allowlisted (15.x via originGuard)
 *   - 401 `unauthorized`       → no valid authenticated session
 *   - 429 `rate_limited`       → > 5 requests / 60s, integer Retry-After (15.3/15.4)
 *   - 404 `no_subscription`    → no stored subscription — no provider call (12.5)
 *   - 200 { url }              → managed billing/payment-method URL (12.4)
 *   - 502 `provider_unreachable` → provider could not produce a URL; stored
 *                                 billing/subscription data is left unchanged (12.3)
 *
 * _Requirements: 12.3, 12.4, 12.5_
 */

/** Per-user manage budget: > 5 within 60s → 429. */
const MANAGE_RATE_LIMIT = 5
const MANAGE_RATE_WINDOW_MS = 60_000

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
    `billing:manage:${userId}`,
    MANAGE_RATE_LIMIT,
    MANAGE_RATE_WINDOW_MS,
  )
  if (rlErr) return rlErr

  // ── 4. Resolve the stored subscription WITHOUT contacting the provider (12.5)
  // The provider is resolved from the user's own stored document (canonical
  // `provider`, legacy fallback) via the subscription mapper — never from input.
  const doc = await getSubscription(userId, jwt)
  const stored = doc ? toUnified(doc) : null
  if (!stored) {
    return NextResponse.json(
      { error: 'no_subscription', message: 'No subscription on file. Subscribe first.' },
      { status: 404 },
    )
  }

  // ── 5. Mint a managed billing/payment-method URL via the resolved provider (12.4)
  // On any provider failure (unreachable, missing customer id, no URL returned)
  // we surface a 502 WITHOUT altering stored billing/subscription data — this
  // route only reads, it never persists (12.3).
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const provider = getProvider(stored.provider)
    const { url } = await provider.getManageUrl({ userId, jwt, appUrl })

    return NextResponse.json({ url })
  } catch (err) {
    console.error(
      '[billing/manage] getManageUrl failed:',
      err instanceof Error ? err.message : err,
    )
    return NextResponse.json(
      {
        error: 'provider_unreachable',
        message: 'The billing provider could not be reached. Please try again.',
      },
      { status: 502 },
    )
  }
}
