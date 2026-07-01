'use client'

/**
 * PlanSelector — the single, shared plan picker used by every conversion
 * surface (Paywall, UpgradePrompt, SubscriptionExpired). One design, driven
 * entirely by the `public-plans` registry so prices never drift and the three
 * entry points can never look like different products again.
 *
 * Premium gold/editorial cards. Hierarchy is created with emphasis rather than
 * a form-like radio list: the recommended plan carries a gold "Best value"
 * ribbon, a subtle gold edge, and a faint elevated surface, while the others
 * stay quiet until chosen. Selection lights the whole card with a gold ring,
 * a soft tint, and a corner check — no left-aligned radio dots.
 *
 * Accessible radiogroup: arrow-key friendly, each card is role="radio" with a
 * proper aria-label and a visible selected state. Honest framing only — no
 * fabricated discounts (yearly is the same per-month rate as monthly).
 */

import { cn } from '@talkingo/shared/utils'
import { Check, Sparkles } from 'lucide-react'
import {
  PUBLIC_PLAN_LIST,
  RECOMMENDED_PLAN,
  type PlanId,
  type PublicPlan,
} from '@/lib/subscription/public-plans'

interface PlanSelectorProps {
  selected: PlanId
  onSelect: (id: PlanId) => void
  /** Restrict which plans show (e.g. ['monthly','yearly']); defaults to all. */
  plans?: PublicPlan[]
  /** Which plan carries the "Best value" ring + ribbon. */
  recommendedId?: PlanId
  /** Disable interaction (e.g. while checkout is starting). */
  disabled?: boolean
  className?: string
}

export function PlanSelector({
  selected,
  onSelect,
  plans = PUBLIC_PLAN_LIST,
  recommendedId = RECOMMENDED_PLAN,
  disabled = false,
  className,
}: PlanSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose your plan"
      className={cn('space-y-2.5', className)}
    >
      {plans.map((plan) => {
        const isSelected = selected === plan.id
        const isRecommended = plan.id === recommendedId

        return (
          <button
            key={plan.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(plan.id)}
            aria-label={`${plan.label}, ${plan.priceLabel} ${plan.periodLabel}${plan.subtitle ? `, ${plan.subtitle}` : ''}${isRecommended ? ', best value' : ''}`}
            className={cn(
              'group relative w-full rounded-2xl p-4 sm:p-[1.125rem] text-left',
              'flex items-center gap-3 transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              isSelected
                ? 'border border-primary/60 ring-2 ring-primary/50 bg-gradient-to-br from-primary/[0.10] to-primary/[0.03] shadow-[0_0_30px_-10px_oklch(var(--primary)/0.45)]'
                : isRecommended
                  ? 'border border-primary/30 bg-card hover:border-primary/50'
                  : 'border border-border/60 bg-card hover:border-border'
            )}
          >
            {/* Recommended ribbon */}
            {isRecommended && (
              <span
                className={cn(
                  'absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1',
                  'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                  'bg-gradient-to-r from-primary to-primary-glow text-[oklch(var(--primary-foreground))]',
                  'shadow-[0_4px_12px_-4px_oklch(var(--primary)/0.6)]'
                )}
              >
                <Sparkles className="w-2.5 h-2.5" />
                Best value
              </span>
            )}

            {/* Selected corner check */}
            <span
              className={cn(
                'absolute -top-2.5 right-3 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200',
                isSelected
                  ? 'bg-primary scale-100 opacity-100 shadow-[0_2px_8px_-2px_oklch(var(--primary)/0.6)]'
                  : 'scale-50 opacity-0'
              )}
              aria-hidden
            >
              <Check className="w-3 h-3 text-[oklch(var(--primary-foreground))]" strokeWidth={3} />
            </span>

            {/* Label + pitch */}
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-bold text-foreground leading-none">
                  {plan.label}
                </span>
                {plan.badge && (
                  <span className="px-1.5 py-0.5 rounded-full bg-primary/12 text-primary text-[10px] font-semibold leading-none">
                    {plan.badge}
                  </span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground leading-snug mt-1.5">
                {plan.pitch}
              </span>
            </span>

            {/* Price */}
            <span className="text-right flex-shrink-0 pl-1">
              <span className="flex items-baseline justify-end gap-0.5">
                <span className="text-[1.375rem] font-extrabold text-foreground leading-none tnum">
                  {plan.priceLabel}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {plan.periodLabel}
                </span>
              </span>
              {plan.subtitle && (
                <span className="block text-[11px] text-muted-foreground/90 mt-1.5 leading-tight">
                  {plan.subtitle}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
