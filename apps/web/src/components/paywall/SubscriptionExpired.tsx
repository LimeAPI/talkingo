'use client'

/**
 * Subscription Expired / Re-subscribe UI.
 * Shown when a user's subscription has been canceled or expired.
 * Offers two paths: re-subscribe (new checkout) or manage billing (portal).
 */

import { useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { AlertTriangle, CreditCard, RefreshCw, Crown, ArrowRight } from 'lucide-react'

interface SubscriptionExpiredProps {
  userEmail?: string
  userId?: string
  customerId?: string
  /** 'expired' | 'canceled' | 'past_due' */
  reason: 'expired' | 'canceled' | 'past_due'
}

export function SubscriptionExpired({ userEmail, userId, customerId, reason }: SubscriptionExpiredProps) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState<'checkout' | 'portal' | null>(null)

  const handleResubscribe = async () => {
    setLoading('checkout')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, email: userEmail, userId }),
      })
      const { url, error } = await res.json()
      if (url) {
        window.location.href = url
      } else {
        console.error('[ReSubscribe] Checkout error:', error)
        setLoading(null)
      }
    } catch (err) {
      console.error('[ReSubscribe] Error:', err)
      setLoading(null)
    }
  }

  const handleManageBilling = async () => {
    if (!customerId) return
    setLoading('portal')
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      })
      const { url, error } = await res.json()
      if (url) {
        window.location.href = url
      } else {
        console.error('[ReSubscribe] Portal error:', error)
        setLoading(null)
      }
    } catch (err) {
      console.error('[ReSubscribe] Error:', err)
      setLoading(null)
    }
  }

  const title = reason === 'past_due'
    ? 'Payment Issue'
    : reason === 'canceled'
      ? 'Subscription Canceled'
      : 'Subscription Expired'

  const subtitle = reason === 'past_due'
    ? 'Your last payment failed. Update your payment method to continue learning.'
    : reason === 'canceled'
      ? 'Your subscription has been canceled. Re-subscribe to continue your progress.'
      : 'Your subscription has expired. Pick up where you left off.'

  const Icon = reason === 'past_due' ? CreditCard : AlertTriangle

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-xl p-4">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
            <Icon className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed px-2">
            {subtitle}
          </p>
        </div>

        {/* Past due: show "Update Payment" button prominently */}
        {reason === 'past_due' && customerId && (
          <button
            onClick={handleManageBilling}
            disabled={loading !== null}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-white font-bold text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading === 'portal' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            {loading === 'portal' ? 'Redirecting...' : 'Update Payment Method'}
          </button>
        )}

        {/* Expired/Canceled: show plan picker + re-subscribe */}
        {reason !== 'past_due' && (
          <>
            {/* Plan selector */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setSelectedPlan('monthly')}
                className={cn(
                  'relative p-4 rounded-2xl border-2 transition-all text-left',
                  selectedPlan === 'monthly'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border/40 hover:border-border/60'
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Monthly</p>
                <p className="text-xl font-bold text-foreground">$7.99</p>
                <p className="text-[10px] text-muted-foreground">/month</p>
              </button>

              <button
                onClick={() => setSelectedPlan('yearly')}
                className={cn(
                  'relative p-4 rounded-2xl border-2 transition-all text-left',
                  selectedPlan === 'yearly'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border/40 hover:border-border/60'
                )}
              >
                <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full bg-emerald-500 text-[9px] font-bold text-white uppercase">
                  Save 37%
                </span>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Yearly</p>
                <p className="text-xl font-bold text-foreground">$59.99</p>
                <p className="text-[10px] text-muted-foreground">/year ($5/mo)</p>
              </button>
            </div>

            {/* Re-subscribe CTA */}
            <button
              onClick={handleResubscribe}
              disabled={loading !== null}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-white font-bold text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading === 'checkout' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Crown className="w-4 h-4" />
              )}
              {loading === 'checkout' ? 'Redirecting...' : 'Re-subscribe Now'}
            </button>
          </>
        )}

        {/* Manage billing link (for expired/canceled users who have a customerId) */}
        {reason !== 'past_due' && customerId && (
          <button
            onClick={handleManageBilling}
            disabled={loading !== null}
            className="w-full py-3 rounded-xl border border-border/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/60 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Manage Billing
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Fine print */}
        <p className="text-center text-[10px] text-muted-foreground/60 leading-relaxed px-4">
          {reason === 'past_due'
            ? 'Update your payment method to restore access. Your progress is saved.'
            : `Your progress and history are saved. ${selectedPlan === 'yearly' ? '$59.99/year' : '$7.99/month'} auto-renews. Cancel anytime.`
          }
        </p>
      </div>
    </div>
  )
}
