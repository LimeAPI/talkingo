/**
 * `resolvePromo` — validate a checkout promo/referral code against the shared
 * `promo_codes` catalog and return what each provider needs to pre-apply it.
 *
 * This is the "apply" side of the promo system (the dash owns "create", the
 * webhook owns "record"). It powers both link-based referrals (the `?ref=` code
 * auto-applies at checkout) and manually-entered promo codes, uniformly across
 * Stripe and Dodo — so we never depend on a given gateway's hosted promo box.
 *
 * Guarantees:
 *  - NEVER throws. Any problem resolves to `null`, so a bad/expired/unknown code
 *    can never block a sale — checkout just proceeds without a discount.
 *  - Validates active / not-expired / plan-eligible against the catalog.
 *  - Drops self-referral (a referrer redeeming their own code).
 *  - Returns the referrer even when THIS provider has no coupon for the code
 *    (e.g. a fixed-amount code that only exists on Stripe), so the referral can
 *    still be attributed via subscription metadata on the other provider.
 */

import 'server-only'
import type { PlanId, ProviderId } from './provider'

export interface ResolvedPromo {
  /** Stripe promotion-code id to attach to the Checkout Session, when present. */
  stripePromotionCodeId?: string
  /** Dodo human discount code to pass as `discount_codes`, when present. */
  dodoDiscountCode?: string
  /** Referrer to stamp into subscription metadata (attribution backup). */
  referrerUserId?: string
}

export async function resolvePromo(params: {
  code?: string
  provider: ProviderId
  plan: PlanId
  currentUserId: string
}): Promise<ResolvedPromo | null> {
  const { code, provider, plan, currentUserId } = params
  if (!code || !code.trim()) return null

  try {
    const { getPromoCodeByCode } = await import('@/lib/appwrite-server')
    const doc = await getPromoCodeByCode(code)
    if (!doc) return null

    // Validate against the catalog — the source of truth the dash maintains.
    if (doc.active === false) return null
    if (typeof doc.expiresAt === 'number' && doc.expiresAt > 0 && doc.expiresAt < Date.now()) {
      return null
    }
    // Plan eligibility: an empty/absent list means "all plans". The trial bills
    // as monthly, so it's treated as monthly for eligibility.
    const effectivePlan = plan === 'yearly' ? 'yearly' : 'monthly'
    if (
      Array.isArray(doc.appliesToPlans) &&
      doc.appliesToPlans.length > 0 &&
      !doc.appliesToPlans.includes(effectivePlan)
    ) {
      return null
    }

    // Self-referral guard: a referrer can't earn from redeeming their own code.
    const referrerUserId =
      doc.referrerUserId && doc.referrerUserId !== currentUserId ? doc.referrerUserId : undefined

    if (provider === 'stripe') {
      if (!doc.stripePromotionCodeId) {
        // No Stripe coupon for this code — still attribute the referrer.
        return referrerUserId ? { referrerUserId } : null
      }
      return { stripePromotionCodeId: doc.stripePromotionCodeId, referrerUserId }
    }

    // Dodo applies discounts by human code, and only when the dash actually
    // created the Dodo discount (dodoDiscountId present). Fixed-amount codes,
    // which Dodo can't represent, will have no dodoDiscountId → attribute only.
    if (!doc.dodoDiscountId) {
      return referrerUserId ? { referrerUserId } : null
    }
    return { dodoDiscountCode: doc.code, referrerUserId }
  } catch {
    // Never block checkout on a promo-resolution failure.
    return null
  }
}
