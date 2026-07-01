'use client'

import { cn } from '@talkingo/shared/utils'
import type { ReactNode } from 'react'

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error'

const TONES: Record<Tone, string> = {
  neutral: 'bg-foreground/[0.05] border-border/50 text-foreground/55',
  primary: 'bg-primary/10 border-primary/20 text-primary',
  success: 'bg-success/10 border-success/25 text-success',
  warning: 'bg-warning/10 border-warning/25 text-warning',
  error: 'bg-error/10 border-error/25 text-error',
}

/**
 * StatusBadge — the single tinted-pill primitive for statuses and counts
 * (paid/failed/past-due, "N fixes", "Clean", "Locked"…). Consolidates the
 * `{color}-500/10 + /20 + 700 dark:400` formula that was copy-pasted across
 * the paywall, history and learn surfaces into one tone system bound to the
 * design tokens.
 */
export function StatusBadge({
  children,
  tone = 'neutral',
  icon,
  uppercase = false,
  className,
}: {
  children: ReactNode
  tone?: Tone
  icon?: ReactNode
  uppercase?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        uppercase && 'uppercase tracking-wide text-[10px]',
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}
