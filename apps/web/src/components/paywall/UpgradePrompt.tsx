'use client'

/**
 * UpgradePrompt — contextual upgrade nudge shown when free users hit a limit.
 * Not a full-screen paywall — it's a modal that explains what they're missing
 * and offers a clear path to upgrade.
 *
 * Variants:
 * - 'messages'   → daily message limit reached
 * - 'mode'       → tried to use handsfree/live call
 * - 'persona'    → tried to select a locked persona
 * - 'level'      → tried to access level 5+
 * - 'voice'      → tried to record a voice message
 * - 'history'    → tried to view older sessions
 * - 'phrasebank' → tried to open phrase bank
 */

import { useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  Crown, MessageCircle, Phone, Headphones, Users,
  Zap, Mic, Clock, BookOpen, X, Sparkles,
} from 'lucide-react'

export type UpgradeReason =
  | 'messages'
  | 'mode'
  | 'persona'
  | 'level'
  | 'voice'
  | 'history'
  | 'phrasebank'

interface UpgradePromptProps {
  reason: UpgradeReason
  onClose: () => void
  userEmail?: string
  userId?: string
  /** Extra context (e.g., persona name, mode name) */
  context?: string
}

const UPGRADE_COPY: Record<UpgradeReason, {
  icon: typeof Crown
  title: string
  subtitle: string
  benefit: string
}> = {
  messages: {
    icon: MessageCircle,
    title: "You've used all 6 messages today",
    subtitle: "You're making great progress! Upgrade for unlimited conversations.",
    benefit: 'Unlimited daily messages',
  },
  mode: {
    icon: Phone,
    title: 'Voice modes are Premium',
    subtitle: 'Handsfree and Live Call modes let you practice speaking naturally — like a real conversation.',
    benefit: 'All conversation modes unlocked',
  },
  persona: {
    icon: Users,
    title: 'This persona is Premium',
    subtitle: 'Each persona teaches differently. Unlock all 6 to find your perfect practice partner.',
    benefit: 'All 6 AI personas',
  },
  level: {
    icon: Zap,
    title: 'Levels 5-12 are Premium',
    subtitle: "You've outgrown the basics! Unlock advanced levels to reach fluency.",
    benefit: 'All 12 levels unlocked',
  },
  voice: {
    icon: Mic,
    title: 'Voice messages are Premium',
    subtitle: 'Record and send voice messages to practice pronunciation with real-time feedback.',
    benefit: 'Voice recording & feedback',
  },
  history: {
    icon: Clock,
    title: 'Full history is Premium',
    subtitle: 'Review all your past conversations and track your improvement over time.',
    benefit: 'Unlimited session history',
  },
  phrasebank: {
    icon: BookOpen,
    title: 'Phrase Bank is Premium',
    subtitle: 'Save and review vocabulary from your sessions. Build your personal dictionary.',
    benefit: 'Personal phrase bank',
  },
}

export function UpgradePrompt({ reason, onClose, userEmail, userId, context }: UpgradePromptProps) {
  const [loading, setLoading] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly')
  const copy = UPGRADE_COPY[reason]
  const Icon = copy.icon

  const handleUpgrade = async () => {
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
        console.error('[UpgradePrompt] Checkout error:', error)
        setLoading(false)
      }
    } catch (err) {
      console.error('[UpgradePrompt] Error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card border border-border/50 rounded-3xl shadow-2xl animate-slide-up overflow-hidden">

        {/* Close button */}
        <div className="flex justify-end p-3 pb-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted/50 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto shadow-lg shadow-primary/20">
              <Icon className="w-6 h-6 text-white" />
            </div>
            <h2 className="font-display text-lg font-bold tracking-tight">
              {copy.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {context ? copy.subtitle.replace('This persona', context) : copy.subtitle}
            </p>
          </div>

          {/* What you get */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Premium includes</p>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { icon: MessageCircle, text: 'Unlimited conversations' },
                { icon: Phone, text: 'Live Call & Handsfree modes' },
                { icon: Users, text: 'All 6 AI personas' },
                { icon: Sparkles, text: 'Full recaps, vocab & phrase bank' },
              ].map(({ icon: ItemIcon, text }) => (
                <div key={text} className="flex items-center gap-2.5 py-1">
                  <ItemIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="text-xs font-medium text-foreground">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Plan toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedPlan('monthly')}
              className={cn(
                'flex-1 py-2.5 rounded-xl border text-center transition-all text-xs font-semibold',
                selectedPlan === 'monthly'
                  ? 'border-primary bg-primary/8 text-primary'
                  : 'border-border/40 text-muted-foreground hover:border-border/60'
              )}
            >
              $7.99/mo
            </button>
            <button
              onClick={() => setSelectedPlan('yearly')}
              className={cn(
                'flex-1 py-2.5 rounded-xl border text-center transition-all text-xs font-semibold relative',
                selectedPlan === 'yearly'
                  ? 'border-primary bg-primary/8 text-primary'
                  : 'border-border/40 text-muted-foreground hover:border-border/60'
              )}
            >
              $59.99/yr
              <span className="absolute -top-1.5 right-2 px-1.5 py-0.5 rounded-full bg-emerald-500 text-[8px] font-bold text-white">
                -37%
              </span>
            </button>
          </div>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-white font-bold text-sm shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Redirecting...' : 'Start for $1 — 5 day trial'}
          </button>

          {/* Fine print */}
          <p className="text-center text-[9px] text-muted-foreground/50">
            $1 today, then {selectedPlan === 'yearly' ? '$59.99/year' : '$7.99/month'}. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  )
}
