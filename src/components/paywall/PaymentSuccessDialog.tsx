'use client'

/**
 * PaymentSuccessDialog — celebratory confirmation shown after a successful
 * checkout (any provider). Listed via CheckoutReturnHandler's onSuccess, it
 * surfaces newly unlocked premium features so the moment feels rewarding
 * instead of silent.
 *
 * Rendered through a portal to <body> so the full-screen confirmation always
 * sits above the app's fixed navigation (it would otherwise be clipped by the
 * blurred/transformed page shell it's mounted inside).
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Check, MessageCircle, Phone, Users, Zap, Crown, BookOpen } from 'lucide-react'
import { PUBLIC_PLANS } from '@/lib/subscription/public-plans'

interface PaymentSuccessDialogProps {
  onClose: () => void
  trialEndsAt?: number
  plan?: 'monthly' | 'yearly'
}

const UNLOCKED = [
  { icon: MessageCircle, text: 'Unlimited conversations' },
  { icon: Phone, text: 'Live Call & Handsfree modes' },
  { icon: Users, text: 'All 6 AI personas' },
  { icon: Zap, text: 'All 12 levels' },
  { icon: BookOpen, text: 'Full session recaps & history' },
]

function formatTrialEnd(ts?: number): string | null {
  if (!ts) return null
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return null
  }
}

/** Registry-driven billing amount so it never drifts from the real prices. */
function billingAmountFor(plan?: 'monthly' | 'yearly'): string {
  const p = PUBLIC_PLANS[plan ?? 'monthly']
  return `${p.priceLabel}${p.periodLabel}`
}

export function PaymentSuccessDialog({ onClose, trialEndsAt, plan }: PaymentSuccessDialogProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const trialEndLabel = formatTrialEnd(trialEndsAt)
  const hasTrial = !!trialEndsAt
  const billingAmount = billingAmountFor(plan)
  const planLabel = plan === 'yearly' ? 'Yearly' : 'Monthly'

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-background/95 backdrop-blur-xl p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/30 shadow-[0_0_40px_-10px_oklch(var(--primary)/0.45)] flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-primary" strokeWidth={1.75} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-gradient-gold">
            {hasTrial ? 'Welcome to Premium!' : 'Subscription Active!'}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {hasTrial
              ? `Your 5-day trial is active.${trialEndLabel ? ` Full access until ${trialEndLabel}.` : ''}`
              : `Your ${planLabel} plan is now active. ${billingAmount} — enjoy unlimited access.`
            }
          </p>
        </div>

        {/* Unlocked features */}
        <div className="bg-card/50 border border-border/40 rounded-2xl p-4 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Just unlocked
          </p>
          {UNLOCKED.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1">{text}</span>
              <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onClose}
          className="btn-gradient w-full justify-center text-base py-4"
        >
          <Crown className="w-4 h-4" />
          Start Speaking
        </button>

        {/* Fine print */}
        <p className="text-center text-[11px] text-muted-foreground/80 leading-relaxed px-4">
          {hasTrial
            ? trialEndLabel
              ? `${billingAmount} starts ${trialEndLabel}. Cancel anytime from your profile.`
              : `${billingAmount} after trial. Cancel anytime from your profile.`
            : `Cancel anytime from your profile.`}
        </p>
      </div>
    </div>,
    document.body
  )
}
