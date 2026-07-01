'use client'

/**
 * TrialCountdownBadge — small chip shown in the top bar during a trial.
 * Reminds the user how long they have left before billing kicks in.
 *
 * Visibility rules:
 * - Only renders for users in 'trialing' status with a trialEndsAt timestamp
 * - Shifts color as time runs out (primary → amber → red)
 */

import { useEffect, useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Clock } from 'lucide-react'
import {
  getTrialCountdownLabel,
  getTrialDaysRemaining,
  getTrialHoursRemaining,
} from '@/lib/subscription/use-subscription'

interface TrialCountdownBadgeProps {
  userId?: string | null
  onClick?: () => void
}

export function TrialCountdownBadge({ userId, onClick }: TrialCountdownBadgeProps) {
  const [label, setLabel] = useState<string | null>(null)
  const [urgency, setUrgency] = useState<'normal' | 'warn' | 'urgent'>('normal')

  useEffect(() => {
    const update = () => {
      const text = getTrialCountdownLabel(userId)
      setLabel(text)
      const days = getTrialDaysRemaining(userId)
      const hours = getTrialHoursRemaining(userId)
      if (days === null) {
        setUrgency('normal')
      } else if (days === 0 && (hours ?? 0) < 12) {
        setUrgency('urgent')
      } else if (days <= 1) {
        setUrgency('warn')
      } else {
        setUrgency('normal')
      }
    }
    update()
    // Refresh every minute so the label stays accurate
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [userId])

  if (!label) return null

  const colorClass =
    urgency === 'urgent'
      ? 'text-red-500 bg-red-500/10 border-red-500/20'
      : urgency === 'warn'
        ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
        : 'text-primary bg-primary/8 border-primary/20'

  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all',
        colorClass,
        onClick && 'hover:scale-105 cursor-pointer'
      )}
      title={label}
    >
      <Clock className="w-3 h-3" />
      <span>{label}</span>
    </button>
  )
}
