import { NextRequest, NextResponse } from 'next/server'
import { originGuard, rateLimitGuard } from '@/lib/payments/guards'
import { getProvider } from '@/lib/payments/registry'
import { getSubscription } from '@/lib/appwrite-server'
import { toUnified } from '@/lib/payments/subscription-mapper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/change-plan — provider-agnostic plan switch.
 *
 * Body: { plan: 'monthly' | 'yearly' }
 *
 * Switches a subscription between monthly and yearly billing with immediate
 * proration. The route is provider-agnostic: it resolves the provider from the
 * user's STORED subscription (canonical `provider` field, legacy fallback) and
 * delegates the actual change to that provider's `changePlan`, which applies
 * immediate proration, retrieves the authoritative state, and persists it
 * through the shared race-safe `syncToAppwrite` writer.
 *
 * Status contract:
 *   - 403 `forbidden_origin`   → origin missing / not allowlisted (15.x via originGuard)
 *   - 401 `unauthorized`       → no valid authenticated session
 *   - 429 `rate_limited`       → > 5 requests / 60s, integer Retry-After (10.7)
 *   - 400 `invalid_plan`       → plan absent or not monthly/yearly — no provider call (10.1)
 *   - 404 `no_subscription`    → no stored sub with a provider sub id — no provider call (10.2)
 *   - 200 { status: 'unchanged', ... } → already on target plan — no provider call (10.3)
 *   - 200 { status, plan, periodEnd }  → plan changed + persisted (10.4, 10.5)
 *   - 500 `change_plan_failed` → target plan unconfigured or provider update/retrieve
 *                                 failed; stored subscription left unchanged (10.6)
 *
 * _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
 */

/** Allowed plan values for a plan change (Req 10.1). */
const ALLOWED_PLANS = ['monthly', 'yearly'] as const
type AllowedPlan = (typeof ALLOWED_PLANS)[number]

/** Per-user plan-change budget: > 5 within 60s → 429 (Req 10.7). */
const CHANGE_PLAN_RATE_LIMIT = 5
const CHANGE_PLAN_RATE_WINDOW_MS = 60_000

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

  // ── 3. Rate limit: > 5 / 60s → 429 + Retry-After (10.7) ─────────────────────
  const rlErr = rateLimitGuard(
    `billing:change-plan:${userId}`,
    CHANGE_PLAN_RATE_LIMIT,
    CHANGE_PLAN_RATE_WINDOW_MS,
  )
  if (rlErr) return rlErr

  // ── 4. Validate plan WITHOUT contacting the provider (10.1) ─────────────────
  const body = (await req.json().catch(() => ({}))) as { plan?: string }
  const plan = body.plan
  if (!plan || !ALLOWED_PLANS.includes(plan as AllowedPlan)) {
    return NextResponse.json(
      { error: 'invalid_plan', message: 'Plan must be "monthly" or "yearly".' },
      { status: 400 },
    )
  }
  const targetPlan = plan as AllowedPlan

  // ── 5. Resolve the stored subscription WITHOUT contacting the provider (10.2)
  // The provider is resolved from the user's own stored document (canonical
  // `provider`, legacy fallback) via the subscription mapper — never from input.
  const doc = await getSubscription(userId, jwt)
  const stored = doc ? toUnified(doc) : null
  if (!stored || !stored.providerSubscriptionId) {
    return NextResponse.json(
      { error: 'no_subscription', message: 'No subscription is available to change.' },
      { status: 404 },
    )
  }

  // ── 6. Idempotent no-op: already on the target plan (10.3) ──────────────────
  // Returned within 2s because we never contact the provider here.
  if (stored.plan === targetPlan) {
    return NextResponse.json({
      status: 'unchanged',
      plan: stored.plan,
      subscriptionStatus: stored.status,
      periodEnd: stored.periodEnd ? new Date(stored.periodEnd).toISOString() : null,
    })
  }

  // ── 7. Apply the plan change via the resolved provider (10.4, 10.5) ─────────
  // The provider applies immediate proration, retrieves the authoritative state,
  // and persists it through `syncToAppwrite`. Any failure (including an
  // unconfigured target plan) throws before persistence, so the stored
  // subscription is left unchanged (10.6).
  try {
    const provider = getProvider(stored.provider)
    const updated = await provider.changePlan({ userId, jwt, plan: targetPlan })

    return NextResponse.json({
      status: updated.status,
      plan: updated.plan,
      periodEnd: updated.periodEnd ? new Date(updated.periodEnd).toISOString() : null,
      currentPeriodEnd: updated.periodEnd ?? null,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
    })
  } catch (err) {
    // 10.6: target plan unconfigured OR provider update/retrieve failed.
    // Nothing was persisted, so the stored subscription remains unchanged.
    console.error(
      '[billing/change-plan] change failed:',
      err instanceof Error ? err.message : err,
    )
    return NextResponse.json(
      { error: 'change_plan_failed', message: 'The plan change could not be completed.' },
      { status: 500 },
    )
  }
}
