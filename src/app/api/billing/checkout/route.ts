import { NextRequest, NextResponse } from 'next/server'
import { originGuard, rateLimitGuard } from '@/lib/payments/guards'
import { getProvider } from '@/lib/payments/registry'
import { getSubscription } from '@/lib/appwrite-server'
import type { PlanId, ProviderId } from '@/lib/payments/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/checkout — provider-agnostic checkout creation.
 *
 * Body: { provider: 'stripe' | 'dodopayments', plan: 'trial' | 'monthly' | 'yearly', method?, email? }
 *
 * Runs the shared mutating-route guards (origin → auth → rate-limit), validates
 * the provider and plan, rejects users who already have a live subscription
 * (double-charge guard), resolves the requested provider through the registry,
 * builds a one-minute idempotency key, and delegates to the provider's
 * `createCheckout` behind a 15-second timeout.
 *
 * Status contract:
 *   - 403 `forbidden_origin`     → origin missing / not allowlisted (15.x via originGuard)
 *   - 401 `unauthorized`         → no valid authenticated session (5.3)
 *   - 429 `rate_limited`         → > 5 requests / 60s, with integer Retry-After (5.4)
 *   - 400 `invalid_*`            → unknown provider or plan (5.5)
 *   - 409 `already_subscribed`   → live active/trialing sub not cancelling (5.6)
 *   - 503 `provider_unavailable` → provider disabled / misconfigured (5.7)
 *   - 502 `provider_error`       → createCheckout failed or timed out (5.10)
 *   - 200 { url }                → hosted checkout URL (5.9)
 *
 * _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 1.4, 1.7, 1.8, 3.3_
 */

/** The set of allowed provider ids (Req 5.5). */
const ALLOWED_PROVIDERS: ProviderId[] = ['stripe', 'dodopayments']

/** The set of allowed plan ids — derived from the plan registry (Req 5.5). */
const ALLOWED_PLANS: PlanId[] = ['trial', 'monthly', 'yearly']

/** Per-user checkout budget: more than 5 in a 60s rolling window → 429 (Req 5.4). */
const CHECKOUT_RATE_LIMIT = 5
const CHECKOUT_RATE_WINDOW_MS = 60_000

/** Max time to wait for the provider to return a checkout URL (Req 5.10). */
const CREATE_CHECKOUT_TIMEOUT_MS = 15_000

export async function POST(req: NextRequest) {
  // ── 1. Origin guard (5.1, 5.2) ─────────────────────────────────────────────
  const originErr = originGuard(req)
  if (originErr) return originErr

  // ── 2. Authentication (5.3) ─────────────────────────────────────────────────
  const { verifyAuth } = await import('@/lib/api/auth-guard')
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401 },
    )
  }
  const { userId, jwt, email: sessionEmail } = auth

  // ── 3. Rate limit: > 5 / 60s → 429 + Retry-After (5.4) ──────────────────────
  const rlErr = rateLimitGuard(
    `billing:checkout:${userId}`,
    CHECKOUT_RATE_LIMIT,
    CHECKOUT_RATE_WINDOW_MS,
  )
  if (rlErr) return rlErr

  // ── 4. Validate provider + plan (5.5) ───────────────────────────────────────
  const body = (await req.json().catch(() => ({}))) as {
    provider?: string
    plan?: string
    method?: string
    country?: string
    email?: string
    promoCode?: string
  }
  const { provider, plan, method, email, promoCode } = body

  if (!provider || !ALLOWED_PROVIDERS.includes(provider as ProviderId)) {
    return NextResponse.json(
      { error: 'invalid_provider', message: 'Unsupported payment provider.' },
      { status: 400 },
    )
  }
  if (!plan || !ALLOWED_PLANS.includes(plan as PlanId)) {
    return NextResponse.json(
      { error: 'invalid_plan', message: 'Unsupported plan.' },
      { status: 400 },
    )
  }

  // Buyer country drives the hosted checkout's currency + regional methods
  // (e.g. UPI for IN). Trust an edge/CDN geo header first (can't be spoofed by
  // the client), then fall back to the client-detected country, then the
  // provider default. Always normalized to a valid ISO 3166-1 alpha-2 code.
  const isAlpha2 = (s: string) => /^[A-Z]{2}$/.test(s)
  const headerCountry = (
    req.headers.get('cf-ipcountry') ||
    req.headers.get('x-vercel-ip-country') ||
    ''
  ).toUpperCase()
  const bodyCountry = (body.country || '').toUpperCase()
  const country = isAlpha2(headerCountry)
    ? headerCountry
    : isAlpha2(bodyCountry)
      ? bodyCountry
      : undefined

  // The 5-day trial is offered on both providers and costs $5 on each. Stripe
  // uses a one-time $5 price; Dodo bundles a one-time $5 product with the first
  // payment (`one_time_product_cart`) plus `trial_period_days: 5`. Either way the
  // customer pays $5 for the trial, then $30/mo — and card-less users can start
  // via UPI/local methods on Dodo. The trial bills as monthly afterwards.

  // ── 5. Double-subscription guard (5.6) ──────────────────────────────────────
  const existing = await getSubscription(userId, jwt)

  // Payment-failure recovery: a past-due user ALREADY has a subscription. They
  // must update their payment method (manage flow), never start a second one —
  // creating a new subscription here would double-bill them. Redirect to manage.
  if (existing && existing.status === 'past_due') {
    return NextResponse.json(
      {
        error: 'payment_past_due',
        message:
          'Your last payment failed. Update your payment method from your profile to restore access.',
      },
      { status: 409 },
    )
  }

  if (
    existing &&
    (existing.status === 'active' || existing.status === 'trialing') &&
    !existing.cancelAtPeriodEnd
  ) {
    return NextResponse.json(
      {
        error: 'already_subscribed',
        message: 'You already have an active subscription. Manage it from your profile.',
      },
      { status: 409 },
    )
  }

  // ── 6. Resolve provider (5.7 / 3.3 / 1.7 / 1.8) ─────────────────────────────
  // Enablement is derived solely from the registry (never raw env vars). A
  // disabled/misconfigured provider surfaces as a "not configured" error → 503;
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

  // ── 6b. Reconcile-on-checkout: recover a missed activation, block double-charge ──
  // The local guard above only sees our DB. If a prior payment succeeded but its
  // activation never reached us (webhook missed + browser return interrupted),
  // our row may still be `incomplete` while the user is ALREADY subscribed at the
  // provider. Before creating a brand-new (second, billable) subscription, ask
  // the provider whether this user's customer already has a live one; if so we
  // adopt it (persist authoritative state) and return 409 so the UI restores the
  // existing plan instead of charging again. Best-effort: a reconcile failure
  // must never block a legitimate first-time checkout.
  if (typeof resolved.adoptExistingSubscription === 'function') {
    try {
      const adopted = await withTimeout(
        resolved.adoptExistingSubscription({ userId, jwt }),
        CREATE_CHECKOUT_TIMEOUT_MS,
      )
      if (
        adopted &&
        (adopted.status === 'active' || adopted.status === 'trialing') &&
        !adopted.cancelAtPeriodEnd
      ) {
        return NextResponse.json(
          {
            error: 'already_subscribed',
            message: 'You already have an active subscription. Manage it from your profile.',
          },
          { status: 409 },
        )
      }
    } catch {
      // Reconcile hiccup — fall through and let checkout proceed normally.
    }
  }

  // ── 7. Create checkout with a one-minute idempotency key (5.8) ──────────────
  // Identical requests within the same one-minute window reuse the same session.
  const idempotencyKey = `checkout_${userId}_${provider}_${plan}_${Math.floor(Date.now() / 60_000)}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    const result = await withTimeout(
      resolved.createCheckout({
        userId,
        plan: plan as PlanId,
        method,
        country,
        // Always prefer the email from the verified session over any
        // client-supplied value (the client value is an untrusted fallback).
        // Dodo requires this to create a new customer; Stripe uses it to
        // pre-fill checkout and attach the customer record.
        email: sessionEmail ?? email,
        // Optional promo/referral code (from a `?ref=` link or a promo field).
        // Validated against the catalog inside the provider; a bad code is
        // ignored so it can never block checkout. Trimmed + length-capped as a
        // cheap sanity bound on untrusted input.
        promoCode:
          typeof promoCode === 'string' && promoCode.trim()
            ? promoCode.trim().slice(0, 64)
            : undefined,
        idempotencyKey,
        appUrl,
      }),
      CREATE_CHECKOUT_TIMEOUT_MS,
    )

    if (!result?.url) {
      // Provider returned without a URL — treat as a provider failure (5.10).
      return NextResponse.json(
        { error: 'provider_error', message: 'The provider could not create a checkout session.' },
        { status: 502 },
      )
    }

    // ── 8. Success (5.9) ──────────────────────────────────────────────────────
    return NextResponse.json({ url: result.url })
  } catch (err) {
    // Provider failure or 15s timeout (5.10).
    console.error('[billing/checkout] createCheckout failed:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'provider_error', message: 'The provider could not create a checkout session.' },
      { status: 502 },
    )
  }
}

/**
 * Reject a promise that does not settle within `ms` milliseconds, so a hung
 * provider call cannot block the checkout route past the 15-second budget.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('createCheckout timed out')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}
