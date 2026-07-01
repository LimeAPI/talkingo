'use client'

/**
 * SubscriptionManager — replaces the old "Manage Subscription" button.
 *
 * Shown to active/trialing/past_due users in ProfileScreen. Provides:
 *   - Current plan summary (label, price, billing date / trial end)
 *   - Inline plan switcher (monthly ↔ yearly) with one-tap upgrade
 *   - Cancel button (cancel at period end) with a 5-second Undo window
 *   - Reactivate button (when scheduled to cancel)
 *   - Provider name display (which provider powers the subscription)
 *   - Past-due recovery action that opens the managed billing surface
 *   - Update payment method (opens the managed billing surface)
 *
 * Every action is provider-agnostic and goes through the unified
 * `/api/billing/*` routes. The manage surface (`/api/billing/manage`) resolves
 * the provider from the stored subscription and returns the provider-hosted
 * portal URL where card UI is required.
 */

import { useEffect, useState, useRef } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  Crown, Check, RefreshCw, ArrowRight, AlertCircle, AlertTriangle,
  CreditCard, X, ReceiptText, ChevronDown,
} from 'lucide-react'
import { authFetch } from '@/lib/api/auth-fetch'
import {
  getSubscriptionInfo,
  saveSubscriptionInfo,
  getNextBillingLabel,
  getTrialCountdownLabel,
  getCancellationLabel,
  type SubscriptionInfo,
} from '@/lib/subscription/use-subscription'
import { PUBLIC_PLANS, type PlanId } from '@/lib/subscription/public-plans'
import { ProviderBadge } from './ProviderBadge'
import { BillingHistoryList } from './BillingHistoryList'
import type { ProviderId } from '@/lib/payments/provider'

/** Providers we can render a friendly badge for. */
const KNOWN_PROVIDERS: ProviderId[] = ['stripe', 'dodopayments']

interface SubscriptionManagerProps {
  userId: string
  onChanged?: (info: SubscriptionInfo) => void
}

type ActionState = 'idle' | 'loading' | 'success' | 'undo'

export function SubscriptionManager({ userId, onChanged }: SubscriptionManagerProps) {
  const [info, setInfo] = useState<SubscriptionInfo>(() => getSubscriptionInfo(userId))
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showPlanSwitch, setShowPlanSwitch] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [action, setAction] = useState<ActionState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const undoCancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (undoCancelTimerRef.current) clearTimeout(undoCancelTimerRef.current)
    }
  }, [])

  // Keep local state in sync with localStorage
  useEffect(() => {
    setInfo(getSubscriptionInfo(userId))
  }, [userId])

  const refresh = async () => {
    try {
      const res = await authFetch('/api/billing/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) return
      const fresh = await res.json()
      const updated: SubscriptionInfo = {
        status: fresh.status,
        plan: fresh.plan,
        customerId: fresh.customerId,
        trialEndsAt: fresh.trialEndsAt,
        currentPeriodEnd: fresh.currentPeriodEnd,
        cancelAtPeriodEnd: fresh.cancelAtPeriodEnd ?? false,
        provider: fresh.provider,
        verifiedAt: Date.now(),
      }
      saveSubscriptionInfo(updated, userId)
      setInfo(updated)
      onChanged?.(updated)
    } catch { /* ignore */ }
  }

  const handleCancel = async () => {
    setAction('loading')
    setErrorMsg(null)
    try {
      const res = await authFetch('/api/billing/cancel', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.message || 'Could not cancel.')
        setAction('idle')
        return
      }
      setSuccessMsg('Cancellation scheduled — tap Undo to keep your plan.')
      setConfirmCancel(false)
      await refresh()
      setAction('undo') // show undo for 5 seconds
      // After 5 seconds, finalize unless the user clicked Undo
      undoCancelTimerRef.current = setTimeout(() => {
        setSuccessMsg('Cancellation confirmed. You keep access until your period ends.')
        setAction('success')
        setTimeout(() => { setSuccessMsg(null); setAction('idle') }, 4000)
      }, 5000)
    } catch {
      setErrorMsg('Connection issue. Try again.')
      setAction('idle')
    }
  }

  const handleUndoCancel = async () => {
    if (undoCancelTimerRef.current) {
      clearTimeout(undoCancelTimerRef.current)
      undoCancelTimerRef.current = null
    }
    setAction('loading')
    setErrorMsg(null)
    try {
      const res = await authFetch('/api/billing/reactivate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.message || 'Could not undo.')
        setAction('idle')
        return
      }
      setSuccessMsg('Cancellation undone — your plan is active.')
      await refresh()
      setAction('success')
      setTimeout(() => { setSuccessMsg(null); setAction('idle') }, 4000)
    } catch {
      setErrorMsg('Connection issue. Try again.')
      setAction('idle')
    }
  }

  const handleReactivate = async () => {
    setAction('loading')
    setErrorMsg(null)
    try {
      const res = await authFetch('/api/billing/reactivate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.message || 'Could not reactivate.')
        setAction('idle')
        return
      }
      setSuccessMsg('Subscription reactivated.')
      await refresh()
      setAction('success')
      setTimeout(() => { setSuccessMsg(null); setAction('idle') }, 3000)
    } catch {
      setErrorMsg('Connection issue. Try again.')
      setAction('idle')
    }
  }

  const handleChangePlan = async (newPlan: 'monthly' | 'yearly') => {
    setAction('loading')
    setErrorMsg(null)
    try {
      const res = await authFetch('/api/billing/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.message || 'Could not change plan.')
        setAction('idle')
        return
      }
      setSuccessMsg(`Switched to ${PUBLIC_PLANS[newPlan].label}.`)
      setShowPlanSwitch(false)
      await refresh()
      setAction('success')
      setTimeout(() => { setSuccessMsg(null); setAction('idle') }, 3000)
    } catch {
      setErrorMsg('Connection issue. Try again.')
      setAction('idle')
    }
  }

  const handleManagePayment = async () => {
    setAction('loading')
    setErrorMsg(null)
    try {
      const res = await authFetch('/api/billing/manage', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setErrorMsg(data.message || 'Could not open billing portal.')
      setAction('idle')
    } catch {
      setErrorMsg('Connection issue. Try again.')
      setAction('idle')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  const currentPlanLabel = info.plan ? PUBLIC_PLANS[info.plan as PlanId]?.label : 'Premium'
  const trialLabel = getTrialCountdownLabel(userId)
  const billingLabel = getNextBillingLabel(userId)
  const cancellationLabel = getCancellationLabel(userId)
  const isPastDue = info.status === 'past_due'
  const isCanceling = !!info.cancelAtPeriodEnd
  // During a trial, switching plans triggers immediate proration at the
  // provider — which would end the "free" trial and charge right away. Hide the
  // switch until the trial converts to an active paid plan.
  const isTrialing = info.status === 'trialing'
  const otherPlan: 'monthly' | 'yearly' = info.plan === 'yearly' ? 'monthly' : 'yearly'
  const otherPlanInfo = PUBLIC_PLANS[otherPlan]
  const showUpgrade = info.plan === 'monthly' && !isCanceling && !isTrialing
  const showDowngrade = info.plan === 'yearly' && !isCanceling && !isTrialing
  const loading = action === 'loading'
  const knownProvider = (info.provider && KNOWN_PROVIDERS.includes(info.provider as ProviderId))
    ? (info.provider as ProviderId)
    : null

  return (
    <div className="surface-card p-4 space-y-3">

      {/* Plan summary */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/30 flex items-center justify-center flex-shrink-0">
          <Crown className="w-5 h-5 text-primary" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Talkingo Premium · {currentPlanLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {trialLabel
              ? trialLabel
              : cancellationLabel
                ? cancellationLabel
                : billingLabel
                  ? `Renews ${billingLabel}`
                  : 'Active subscription'}
          </p>
          {/* Provider name display (Req 12.6) */}
          {knownProvider && (
            <div className="mt-1.5">
              <ProviderBadge provider={knownProvider} />
            </div>
          )}
        </div>
      </div>

      {/* Past-due banner */}
      {isPastDue && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Last payment failed
            </p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
              Update your payment method to keep access.
            </p>
          </div>
          <button
            onClick={handleManagePayment}
            disabled={loading}
            className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-semibold text-amber-700 dark:text-amber-400 transition-colors"
          >
            Fix
          </button>
        </div>
      )}

      {/* Status messages */}
      {successMsg && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl border',
          action === 'undo'
            ? 'bg-amber-500/10 border-amber-500/20'
            : 'bg-emerald-500/10 border-emerald-500/20'
        )}>
          <Check className={cn(
            'w-3.5 h-3.5 flex-shrink-0',
            action === 'undo' ? 'text-amber-500' : 'text-emerald-500'
          )} />
          <p className={cn(
            'text-[11px] flex-1',
            action === 'undo' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
          )}>
            {successMsg}
          </p>
          {action === 'undo' && (
            <button
              onClick={handleUndoCancel}
              className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-semibold text-amber-700 dark:text-amber-400 transition-colors"
            >
              Undo
            </button>
          )}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
          <p className="text-[11px] text-red-700 dark:text-red-400">{errorMsg}</p>
        </div>
      )}

      {/* Inline plan switcher */}
      {showPlanSwitch && (
        <div className="rounded-xl border border-border/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">
            Switch to {otherPlanInfo.label}?
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            You&apos;ll be charged {otherPlanInfo.priceLabel}{otherPlanInfo.periodLabel} starting now,
            with a prorated credit for unused time on your current plan.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPlanSwitch(false)}
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleChangePlan(otherPlan)}
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Cancel confirmation */}
      {confirmCancel && (
        <div className="rounded-xl border border-border/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">Cancel subscription?</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            You&apos;ll keep access until {billingLabel || 'your period ends'}, then your account
            returns to free. Your progress and history stay.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmCancel(false)}
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              Keep
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              Cancel anyway
            </button>
          </div>
        </div>
      )}

      {/* Action buttons (hidden while a confirmation is open) */}
      {!confirmCancel && !showPlanSwitch && (
        <div className="space-y-1.5">
          {/* Trial hint: plan switching unlocks after the trial converts */}
          {isTrialing && !isCanceling && (
            <p className="text-[11px] text-muted-foreground/80 text-center leading-snug px-1 pb-0.5">
              You can switch to yearly once your trial converts to a paid plan.
            </p>
          )}

          {/* Reactivate (if cancellation pending) */}
          {isCanceling && (
            <button
              onClick={handleReactivate}
              disabled={loading}
              className="w-full px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reactivate subscription
            </button>
          )}

          {/* Upgrade monthly → yearly */}
          {showUpgrade && (
            <button
              onClick={() => setShowPlanSwitch(true)}
              disabled={loading}
              className="w-full px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/15 transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Switch to Yearly
            </button>
          )}

          {/* Downgrade yearly → monthly */}
          {showDowngrade && (
            <button
              onClick={() => setShowPlanSwitch(true)}
              disabled={loading}
              className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border/40 text-muted-foreground text-xs font-medium hover:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
            >
              Switch to Monthly
            </button>
          )}

          {/* Manage payment method */}
          <button
            onClick={handleManagePayment}
            disabled={loading}
            className="w-full px-3 py-2.5 rounded-xl border border-border/40 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <CreditCard className="w-3.5 h-3.5" />
            {loading ? 'Opening...' : 'Update payment method'}
          </button>

          {/* Cancel */}
          {!isCanceling && (
            <button
              onClick={() => setConfirmCancel(true)}
              disabled={loading}
              className={cn(
                'w-full px-3 py-2 text-[11px] font-medium transition-colors',
                'text-muted-foreground/70 hover:text-muted-foreground'
              )}
            >
              Cancel subscription
            </button>
          )}
        </div>
      )}

      {/* Billing history (Req 12.1) — collapsible sub-section */}
      {!confirmCancel && !showPlanSwitch && (
        <div className="pt-1">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="w-full px-3 py-2 rounded-xl border border-border/40 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-1.5"
            aria-expanded={showHistory}
          >
            <ReceiptText className="w-3.5 h-3.5" />
            {showHistory ? 'Hide billing history' : 'View billing history'}
            <ChevronDown
              className={cn('w-3.5 h-3.5 transition-transform', showHistory && 'rotate-180')}
            />
          </button>
          {showHistory && (
            <div className="mt-2">
              <BillingHistoryList />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
