/**
 * Client-safe plan metadata.
 *
 * This is a hand-mirrored copy of `src/lib/stripe/plans.ts`'s public fields,
 * intentionally separated so client components don't accidentally import the
 * Stripe price IDs (which would be useless on the client and a noisy bundle).
 *
 * Keep these in sync with the server-side plan registry.
 *
 * Pricing note: yearly ($360/yr) is the SAME per-month rate as monthly
 * ($30/mo) — there is no price discount. We therefore never show a fabricated
 * "Save X%" badge. Yearly's honest value prop is convenience: pay once, no
 * recurring monthly charges.
 */

export type PlanId = 'trial' | 'monthly' | 'yearly'

export interface PublicPlan {
  id: PlanId
  label: string
  priceLabel: string
  periodLabel: string
  /** Honest highlight chip (no fabricated discounts). */
  badge?: string
  /** @deprecated yearly has no discount — kept for backwards-compat, always undefined. */
  savingsLabel?: string
  subtitle?: string
  pitch: string
  /** Action-oriented label for the checkout button, e.g. "Subscribe — $30/mo". */
  ctaLabel: string
  trialDays?: number
  sortOrder: number
}

export const PUBLIC_PLANS: Record<PlanId, PublicPlan> = {
  trial: {
    id: 'trial',
    label: '5-Day Trial',
    priceLabel: '$5',
    periodLabel: 'today',
    badge: 'Low commitment',
    subtitle: 'then $30/mo',
    pitch: 'Full Premium for 5 days. Cancel anytime before billing.',
    ctaLabel: 'Start 5-day trial — $5',
    trialDays: 5,
    sortOrder: 0,
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    priceLabel: '$30',
    periodLabel: '/month',
    pitch: 'Full Premium, billed monthly. Cancel anytime.',
    ctaLabel: 'Subscribe — $30/mo',
    sortOrder: 1,
  },
  yearly: {
    id: 'yearly',
    label: 'Yearly',
    priceLabel: '$360',
    periodLabel: '/year',
    badge: 'Pay once',
    subtitle: '$30/mo · billed annually',
    pitch: 'One payment for the whole year. No monthly charges.',
    ctaLabel: 'Subscribe — $360/yr',
    sortOrder: 2,
  },
}

export const PUBLIC_PLAN_LIST: PublicPlan[] = Object.values(PUBLIC_PLANS).sort(
  (a, b) => a.sortOrder - b.sortOrder
)

/**
 * The plan we visually anchor as recommended. Yearly is always available
 * (no provider/region dependency, unlike the trial), so it's a safe default
 * selection and the natural "pay once" anchor.
 */
export const RECOMMENDED_PLAN: PlanId = 'yearly'

/** Resolve the action-oriented checkout CTA label for a plan. */
export function planCtaLabel(planId: PlanId): string {
  return PUBLIC_PLANS[planId]?.ctaLabel ?? 'Continue to checkout'
}
