'use client'

/**
 * UpgradePrompt — contextual upgrade nudge for free users hitting a specific
 * limit (out of messages, locked mode/persona/level, etc.). Uses the same
 * shared shell + plan selector + payment picker as the full Paywall, so the
 * two surfaces are visually identical — only the headline copy changes to
 * match the moment that triggered it.
 */

import { useState } from 'react'
import {
  Crown, MessageCircle, Phone, Users, Zap, Mic, Clock,
} from 'lucide-react'
import { PaymentMethodPicker } from './PaymentMethodPicker'
import { PaywallShell } from './shared/PaywallShell'
import { PlanSelector } from './shared/PlanSelector'
import { RECOMMENDED_PLAN, type PlanId } from '@/lib/subscription/public-plans'

export type UpgradeReason =
  | 'messages'
  | 'mode'
  | 'persona'
  | 'level'
  | 'voice'
  | 'history'

interface UpgradePromptProps {
  reason: UpgradeReason
  onClose: () => void
  userEmail?: string
  userId?: string
  /** Extra context (e.g., persona name) */
  context?: string
}

const UPGRADE_COPY: Record<UpgradeReason, { icon: typeof Crown; title: string; subtitle: string }> = {
  messages: {
    icon: MessageCircle,
    title: "You've used all your free messages",
    subtitle: 'Upgrade for unlimited conversations and keep your momentum.',
  },
  mode: {
    icon: Phone,
    title: 'Voice modes are Premium',
    subtitle: 'Handsfree, Native, and Live Call let you practice speaking naturally.',
  },
  persona: {
    icon: Users,
    title: 'This persona is Premium',
    subtitle: 'Unlock all 6 personas to find your perfect practice partner.',
  },
  level: {
    icon: Zap,
    title: 'Levels 5–12 are Premium',
    subtitle: 'Unlock advanced levels to reach fluency.',
  },
  voice: {
    icon: Mic,
    title: 'Voice messages are Premium',
    subtitle: 'Record voice messages with real-time pronunciation feedback.',
  },
  history: {
    icon: Clock,
    title: 'Full history is Premium',
    subtitle: 'Review every past conversation and track your improvement.',
  },
}

export function UpgradePrompt({ reason, onClose, context }: UpgradePromptProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(RECOMMENDED_PLAN)
  const copy = UPGRADE_COPY[reason]

  return (
    <PaywallShell
      icon={copy.icon}
      title={copy.title}
      subtitle={context ? copy.subtitle.replace('This persona', context) : copy.subtitle}
      onClose={onClose}
    >
      <div className="space-y-5">
        <PlanSelector selected={selectedPlan} onSelect={setSelectedPlan} />

        <PaymentMethodPicker selectedPlan={selectedPlan} />

        <p className="text-center text-[11px] text-muted-foreground/80">
          Cancel anytime from your profile.
        </p>
      </div>
    </PaywallShell>
  )
}
