'use client'

/**
 * Subscription Expired / Re-subscribe UI.
 * Shown when a user's subscription has been canceled or expired, or when the
 * last payment failed (past_due).
 *
 * Uses the shared PaywallShell + PlanSelector + PaymentMethodPicker so it
 * matches the Paywall and UpgradePrompt exactly. Prices come from the plan
 * registry (no more hardcoded $30 / $360 that could drift).
 *
 *   - past_due → prominent "Update payment method" (opens managed portal).
 *   - expired/canceled → plan picker + re-subscribe checkout, plus an optional
 *     "Manage billing" link.
 *
 * The portal call no longer requires a customerId — the server looks it up
 * from the authenticated user's subscription doc, so this UI works even if
 * localStorage was cleared.
 */

import { useState } from 'react'
import { AlertTriangle, CreditCard, RefreshCw, ArrowRight } from 'lucide-react'
import { authFetch } from '@/lib/api/auth-fetch'
import { PaymentMethodPicker } from './PaymentMethodPicker'
import { PaywallShell } from './shared/PaywallShell'
import { PlanSelector } from './shared/PlanSelector'
import { PUBLIC_PLANS, RECOMMENDED_PLAN } from '@/lib/subscription/public-plans'

interface SubscriptionExpiredProps {
  userEmail?: string
  userId?: string
  customerId?: string
  /** 'expired' | 'canceled' | 'past_due' */
  reason: 'expired' | 'canceled' | 'past_due'
}

// Re-subscribe offers the two recurring plans (no trial for returning users).
const RESUB_PLANS = [PUBLIC_PLANS.monthly, PUBLIC_PLANS.yearly]

export function SubscriptionExpired({ userId, customerId, reason }: SubscriptionExpiredProps) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>(
    RECOMMENDED_PLAN === 'monthly' ? 'monthly' : 'yearly'
  )
  const [loading, setLoading] = useState<'portal' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  void userId

  const handleManageBilling = async () => {
    setLoading('portal')
    setErrorMsg(null)
    try {
      const res = await authFetch('/api/billing/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setErrorMsg(data.message || 'Could not open billing portal.')
      setLoading(null)
    } catch (err) {
      console.error('[ReSubscribe] Error:', err)
      setErrorMsg('Connection issue. Try again.')
      setLoading(null)
    }
  }

  const title = reason === 'past_due'
    ? 'Payment issue'
    : reason === 'canceled'
      ? 'Subscription canceled'
      : 'Subscription expired'

  const subtitle = reason === 'past_due'
    ? 'Your last payment failed. Update your payment method to continue learning.'
    : reason === 'canceled'
      ? 'Your subscription has been canceled. Re-subscribe to continue your progress.'
      : 'Your subscription has expired. Pick up right where you left off.'

  const Icon = reason === 'past_due' ? CreditCard : AlertTriangle

  // We can attempt to manage billing regardless of localStorage customerId now —
  // the server resolves it from the subscription doc. Past-due users always
  // benefit from the portal even if cached customerId is missing.
  const canManageBilling = reason === 'past_due' || !!customerId

  return (
    <PaywallShell icon={Icon} title={title} subtitle={subtitle} tone="warning">
      <div className="space-y-5">
        {/* Past due → update payment method (no plan picker needed) */}
        {reason === 'past_due' && (
          <button
            onClick={handleManageBilling}
            disabled={loading !== null}
            className="btn-gradient w-full justify-center text-[0.9375rem] py-3.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
          >
            {loading === 'portal' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            {loading === 'portal' ? 'Redirecting…' : 'Update payment method'}
          </button>
        )}

        {/* Expired / canceled → plan picker + re-subscribe */}
        {reason !== 'past_due' && (
          <>
            <PlanSelector
              selected={selectedPlan}
              onSelect={(id) => setSelectedPlan(id as 'monthly' | 'yearly')}
              plans={RESUB_PLANS}
            />
            <PaymentMethodPicker selectedPlan={selectedPlan} onError={setErrorMsg} />

            {canManageBilling && (
              <button
                onClick={handleManageBilling}
                disabled={loading !== null}
                className="w-full py-3 rounded-xl border border-border/50 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Manage billing
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}

        {/* Error (portal errors; checkout errors render inline in the picker) */}
        {errorMsg && (
          <p className="text-xs text-red-600 dark:text-red-400 text-center px-2" role="alert">
            {errorMsg}
          </p>
        )}

        {/* Fine print */}
        <p className="text-center text-[11px] text-muted-foreground/80 leading-relaxed px-2">
          {reason === 'past_due'
            ? 'Update your payment method to restore access. Your progress is saved.'
            : 'Your progress and history are saved. Subscription auto-renews. Cancel anytime.'}
        </p>
      </div>
    </PaywallShell>
  )
}
