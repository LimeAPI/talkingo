/**
 * Promo / referral redemption capture — the one place a paid conversion is
 * turned into a `promo_redemptions` ledger row.
 *
 * The admin dashboard treats a redeemed code as the referral link (each referrer
 * owns a unique code), so recording "this code was redeemed by this buyer, who
 * actually paid" is the whole of referral attribution — no signup-time cookies
 * or separate attribution store required. This runs off the webhook apply path
 * (the same path that persists the subscription), so it only ever fires for a
 * real, provider-confirmed payment.
 *
 * Everything here is BEST-EFFORT and never throws: promo/referral reporting must
 * never disrupt or fail a legitimate activation. Idempotency comes from keying
 * the ledger row on `${provider}_${subscriptionId}`, so multiple webhook
 * deliveries for the same activation record the redemption exactly once.
 */

import 'server-only'
import type { NormalizedEvent, ProviderId } from './provider'

/**
 * Build a valid Appwrite document id: at most 36 chars, restricted to
 * `[a-zA-Z0-9_.-]`, and never leading with a special character. Provider
 * subscription ids already satisfy this once prefixed; other sources are
 * sanitized defensively.
 */
function safeDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^[^a-zA-Z0-9]+/, '')
  return cleaned.slice(0, 36) || `red_${Date.now()}`
}

/**
 * Record a promo/referral redemption for a paid activation.
 *
 * Acts only when the event carries promo context AND the subscription is in a
 * paid state (`active` / `trialing`) AND at least one code identifier is present.
 * Resolves the buyer's email for the report (best-effort) and writes an
 * idempotent `promo_redemptions` row. Any failure is swallowed.
 */
export async function recordRedemptionFromEvent(
  providerId: ProviderId,
  userId: string,
  event: NormalizedEvent,
): Promise<void> {
  try {
    const promo = event.promo
    const sub = event.subscription
    if (!promo || !sub) return
    if (sub.status !== 'active' && sub.status !== 'trialing') return
    // Record when there's a code (discount/promo) OR just a referrer stamped in
    // metadata — the latter lets referral attribution survive even when no
    // discount reached this provider (e.g. a Stripe-only fixed code on Dodo).
    if (!promo.code && !promo.couponId && !promo.promotionCodeId && !promo.referrerUserId) return

    const mod = await import('@/lib/appwrite-server')

    // Best-effort buyer email for the dashboard report — optional enrichment.
    let refereeEmail: string | undefined
    try {
      const u: any = await mod.getAdminUsers().get(userId)
      refereeEmail = u?.email || undefined
    } catch {
      /* email is optional */
    }

    const subscriptionId = sub.providerSubscriptionId
    const dedupeSource = subscriptionId
      ? `${providerId}_${subscriptionId}`
      : `${providerId}_${promo.promotionCodeId ?? promo.couponId ?? promo.code}_${userId}`

    await mod.recordPromoRedemption(
      {
        provider: providerId,
        code: promo.code,
        couponId: promo.couponId,
        promotionCodeId: promo.promotionCodeId,
        referrerUserId: promo.referrerUserId,
        refereeUserId: userId,
        refereeEmail,
        plan: sub.plan,
        amount: promo.amount,
        currency: promo.currency,
        subscriptionId,
        convertedAt: sub.updatedAt || Date.now(),
      },
      safeDocId(dedupeSource),
    )
  } catch {
    // Never let redemption reporting affect the payment apply path.
  }
}
