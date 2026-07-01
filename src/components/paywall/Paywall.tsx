'use client'

/**
 * Paywall — shown when a free user needs to convert.
 *
 * Three plans (registry-driven via PUBLIC_PLAN_LIST):
 *   - 5-Day Trial ($5 today, then $30/mo)            — Stripe or Dodo*
 *   - Monthly ($30/mo, no trial)                     — Stripe or Dodo
 *   - Yearly ($360/yr, billed annually)              — Stripe or Dodo
 *
 * *The trial is offered by any provider whose one-time $5 trial product is
 * configured; PaymentMethodPicker hides the trial for a provider that can't
 * charge the $5 (so a $0 trial is never shown).
 *
 * Flow: pick a plan → the PaymentMethodPicker smart-defaults to the best
 * provider for the region and owns the single, clear checkout CTA. Yearly is
 * preselected (always available; the honest "pay once" anchor).
 *
 * Layout + container come from the shared PaywallShell; the plan cards come
 * from the shared PlanSelector — so this screen can never visually drift from
 * UpgradePrompt / SubscriptionExpired again.
 */

import { useState } from 'react'
import {
  Crown, MessageCircle, Phone, Users, Zap, RefreshCw,
} from 'lucide-react'
import { PUBLIC_PLAN_LIST, RECOMMENDED_PLAN, type PlanId } from '@/lib/subscription/public-plans'
import { PaymentMethodPicker } from './PaymentMethodPicker'
import { PaywallShell } from './shared/PaywallShell'
import { PlanSelector } from './shared/PlanSelector'
import { authFetch } from '@/lib/api/auth-fetch'
import { saveSubscriptionInfo, type SubscriptionInfo } from '@/lib/subscription/use-subscription'

interface PaywallProps {
  userEmail?: string
  userId?: string
  /** Optional close handler — when omitted the paywall is non-dismissible */
  onClose?: () => void
}

/** Compact, scannable value props — kept to four so the CTA stays near the fold. */
const FEATURES = [
  { icon: MessageCircle, text: 'Unlimited conversations' },
  { icon: Phone, text: 'Live voice calls & all modes' },
  { icon: Users, text: 'All 6 personas · 12 levels' },
  { icon: Zap, text: 'Premium voices, recaps & history' },
]

export function Paywall({ userId, onClose }: PaywallProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(RECOMMENDED_PLAN)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // "Already paid?" recovery — for users who completed payment but whose
  // activation never reached us (missed webhook + interrupted return). Calls
  // /api/billing/restore, which re-reads the live subscription from the provider
  // and re-persists it. No new charge is ever created.
  const [restoreState, setRestoreState] = useState<'idle' | 'loading' | 'none'>('idle')

  const handleRestore = async () => {
    setRestoreState('loading')
    setErrorMsg(null)
    try {
      const res = await authFetch('/api/billing/restore', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.restored) {
        const info: SubscriptionInfo = {
          status: data.status,
          plan: data.plan,
          customerId: data.customerId,
          trialEndsAt: data.trialEndsAt,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          provider: data.provider,
        }
        saveSubscriptionInfo(info, userId)
        window.location.reload()
        return
      }
      setRestoreState('none')
    } catch {
      setErrorMsg('Could not check for an existing subscription. Please try again.')
      setRestoreState('idle')
    }
  }

  return (
    <PaywallShell
      icon={Crown}
      title="Unlock Talkingo Premium"
      subtitle="Speak fluently with unlimited practice. Choose what works for you."
      onClose={onClose}
    >
      <div className="space-y-5">
        {/* Features — clean two-column grid with room to breathe */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 ring-1 ring-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
              </div>
              <span className="text-xs font-medium text-foreground leading-snug pt-1">{text}</span>
            </div>
          ))}
        </div>

        {/* Plan selector (shared) */}
        <PlanSelector
          selected={selectedPlan}
          onSelect={setSelectedPlan}
          plans={PUBLIC_PLAN_LIST}
        />

        {/* Payment method + checkout (shared, owns provider selection + CTA) */}
        <PaymentMethodPicker selectedPlan={selectedPlan} onError={setErrorMsg} />

        {/* Footer: restore + fine print */}
        <div className="space-y-2.5 pt-1">
          {errorMsg && (
            <p className="text-xs text-red-600 dark:text-red-400 text-center px-2" role="alert">
              {errorMsg}
            </p>
          )}
          <div className="text-center">
            <button
              onClick={handleRestore}
              disabled={restoreState === 'loading'}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
            >
              {restoreState === 'loading' && <RefreshCw className="w-3 h-3 animate-spin" />}
              {restoreState === 'loading' ? 'Checking your account…' : 'Already paid? Restore purchase'}
            </button>
            {restoreState === 'none' && (
              <p className="text-[11px] text-muted-foreground mt-1 px-2">
                No active subscription found. If you were just charged, wait a minute and try again.
              </p>
            )}
          </div>

          <p className="text-center text-[11px] text-muted-foreground/80 leading-relaxed px-2">
            Cancel anytime from your profile. Subscription auto-renews. Tax may apply.
          </p>

          {onClose && (
            <button
              onClick={onClose}
              className="w-full py-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              Maybe later
            </button>
          )}
        </div>
      </div>
    </PaywallShell>
  )
}
