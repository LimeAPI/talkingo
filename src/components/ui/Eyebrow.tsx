'use client'

import { cn } from '@talkingo/shared/utils'
import type { ReactNode } from 'react'

/**
 * Eyebrow — the single section label used across the app. Promotes the
 * font-mono uppercase motif that Talk/History already shared into one
 * primitive so every screen labels sections identically.
 */
export function Eyebrow({
  children,
  muted = false,
  className,
}: {
  children: ReactNode
  /** Quiet variant (foreground/45) instead of the gold accent. */
  muted?: boolean
  className?: string
}) {
  return (
    <span className={cn('eyebrow', muted && 'eyebrow--muted', className)}>
      {children}
    </span>
  )
}
