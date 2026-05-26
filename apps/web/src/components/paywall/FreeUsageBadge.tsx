'use client'

/**
 * FreeUsageBadge — shows remaining daily messages for free users.
 * Displayed in the top bar during conversations.
 * Changes color as messages run out (green → amber → red).
 */

import { cn } from '@talkingo/shared/utils'
import { MessageCircle } from 'lucide-react'
import { FREE_TIER } from '@/lib/subscription/free-tier'

interface FreeUsageBadgeProps {
  remaining: number
  onClick?: () => void
}

export function FreeUsageBadge({ remaining, onClick }: FreeUsageBadgeProps) {
  const total = FREE_TIER.DAILY_MESSAGES
  const ratio = remaining / total

  const colorClass = ratio > 0.5
    ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
    : ratio > 0.16
      ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
      : 'text-red-500 bg-red-500/10 border-red-500/20'

  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all',
        colorClass,
        onClick && 'hover:scale-105 cursor-pointer'
      )}
      title={`${remaining} messages remaining today`}
    >
      <MessageCircle className="w-3 h-3" />
      <span>{remaining}/{total}</span>
    </button>
  )
}
