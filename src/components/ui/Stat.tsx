'use client'

import { cn } from '@talkingo/shared/utils'
import type { ReactNode } from 'react'

/**
 * Stat — the single quick-glance metric. Replaces the four hand-rolled stat
 * treatments that drifted across Learn / History / Profile / Talk.
 *
 * `size` tunes the value type scale; pass `wrap` to render inside a surface
 * card (History summary trio) or leave bare for inline header rows.
 */
export function Stat({
  value,
  label,
  sub,
  size = 'md',
  wrap = false,
  className,
}: {
  value: ReactNode
  label: ReactNode
  sub?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Wrap in a surface-card (centered tile). */
  wrap?: boolean
  className?: string
}) {
  const valueSize =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-xl'

  const inner = (
    <div className={cn('stat', !wrap && className)}>
      <span className={cn('stat__value', valueSize)}>{value}</span>
      <span className="stat__label">{label}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  )

  if (!wrap) return inner
  return <div className={cn('surface-card p-4', className)}>{inner}</div>
}
