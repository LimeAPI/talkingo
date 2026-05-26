'use client'

/**
 * Paywall — shown when user doesn't have an active subscription.
 * Clean, modern, premium feel. Two options: monthly or yearly.
 * $1 trial for 5 days, then auto-converts.
 */

import { useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Sparkles, Check, Zap, MessageCircle, Phone, Users, Crown } from 'lucide-react'

interface PaywallProps {
  userEmail?: string
  userId?: string
}

const FEATURES = [
  { icon: MessageCircle, text: 'Unlimited conversations' },
  { icon: Phone, text: 'Live voice calls with AI' },
  { icon: Users, text: 'All 6 AI personas' },
  { icon: Zap, text: 'All 12 levels unlocked' },
  { icon: Sparkles, text: 'Premium voices & teaching cards' },
  { icon: Crown, text: 'Full session recaps & history' },
]

export function Paywall({ userEmail, userId }: PaywallProps) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(false)

  const handleSubscribe = async () => {
    setLoading(true)
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
        console.error('[Paywall] Checkout error:', error)
        setLoading(false)
      }
    } catch (err) {
      console.error('[Paywall] Error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-xl p-4">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto shadow-lg shadow-primary/20">
            <Crown className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Unlock Talkingo
          </h1>
          <p className="text-sm text-muted-foreground">
            Start speaking fluently for just $1
          </p>
        </div>

        {/* Features */}
        <div className="space-y-2.5 px-2">
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">{text}</span>
              <Check className="w-4 h-4 text-emerald-500 ml-auto flex-shrink-0" />
            </div>
          ))}
        </div>

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
            {/* Save badge */}
            <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full bg-emerald-500 text-[9px] font-bold text-white uppercase">
              Save 37%
            </span>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Yearly</p>
            <p className="text-xl font-bold text-foreground">$59.99</p>
            <p className="text-[10px] text-muted-foreground">/year ($5/mo)</p>
          </button>
        </div>

        {/* CTA */}
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-white font-bold text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Redirecting...' : 'Start for $1 — 5 day trial'}
        </button>

        {/* Fine print */}
        <p className="text-center text-[10px] text-muted-foreground/60 leading-relaxed px-4">
          $1 charged today for 5-day trial. After trial, {selectedPlan === 'yearly' ? '$59.99/year' : '$7.99/month'} auto-renews. Cancel anytime from your account settings.
        </p>
      </div>
    </div>
  )
}
