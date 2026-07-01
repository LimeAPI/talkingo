'use client'

/**
 * PaywallShell — the single, shared container for every conversion / billing
 * surface (Paywall, UpgradePrompt, SubscriptionExpired). Centralizing the
 * container, header, scroll behavior, and close affordance here is what keeps
 * all the payment screens visually consistent.
 *
 * Layering: rendered through a portal to <body> so it escapes any ancestor
 * stacking context (the app's blurred/transformed nav + page shells create
 * their own contexts). This is what lets a single high z-index actually cover
 * the fixed top navigation instead of being clipped behind it.
 *
 * Presentation:
 *   - Mobile: a full-screen takeover (edge to edge, safe-area aware) — the
 *     primary, focused conversion moment, never a clipped floating card.
 *   - Desktop (sm+): a centered, elevated premium panel.
 *
 * Visual language: gold/editorial to match the rest of the product — a soft
 * gold halo behind the header, a tinted icon medallion with a gold ring +
 * glow, a gradient-gold title, and a hairline divider.
 *
 * Behavior:
 *   - Body scrolls inside the surface; the close button stays put.
 *   - Locks background scroll while open and restores it on unmount.
 *   - Closes on Escape and on backdrop click (only when dismissible).
 */

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@talkingo/shared/utils'
import { X, type LucideIcon } from 'lucide-react'

type Tone = 'brand' | 'warning'

interface PaywallShellProps {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  /** Omit to make the surface non-dismissible (e.g. a hard paywall). */
  onClose?: () => void
  /** Icon badge tone — gold (default) or amber for warnings. */
  tone?: Tone
  children: ReactNode
  /** Optional footer that stays visually attached below the body. */
  footer?: ReactNode
  className?: string
}

/** Per-tone medallion + halo treatment (soft, editorial — not a saturated chip). */
const TONE: Record<
  Tone,
  { medallion: string; icon: string; halo: string; title: string }
> = {
  brand: {
    medallion:
      'bg-primary/10 ring-1 ring-primary/30 shadow-[0_0_40px_-10px_oklch(var(--primary)/0.45)]',
    icon: 'text-primary',
    halo: 'bg-[radial-gradient(60%_55%_at_50%_0%,oklch(var(--primary)/0.16),transparent_70%)]',
    title: 'text-gradient-gold',
  },
  warning: {
    medallion:
      'bg-amber-500/12 ring-1 ring-amber-500/30 shadow-[0_0_40px_-10px_rgba(245,158,11,0.5)]',
    icon: 'text-amber-500',
    halo: 'bg-[radial-gradient(60%_55%_at_50%_0%,rgba(245,158,11,0.14),transparent_70%)]',
    title: 'text-foreground',
  },
}

export function PaywallShell({
  icon: Icon,
  title,
  subtitle,
  onClose,
  tone = 'brand',
  children,
  footer,
  className,
}: PaywallShellProps) {
  // Portal target only exists in the browser — gate rendering until mounted so
  // this is SSR-safe.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Escape to close (only when dismissible).
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  const t = TONE[tone]

  const overlay = (
    <div
      className="fixed inset-0 z-[600] flex items-stretch sm:items-center justify-center sm:p-6 bg-background/85 backdrop-blur-xl"
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose() } : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'relative w-full flex flex-col',
          // Mobile: full-screen takeover. Desktop: centered elevated panel.
          'h-[100dvh] sm:h-auto sm:max-w-md sm:max-h-[88vh]',
          'bg-card sm:bg-card/95 sm:backdrop-blur-xl',
          'sm:border sm:border-border/60',
          'rounded-none sm:rounded-[1.75rem]',
          'sm:shadow-2xl sm:shadow-black/30',
          'animate-slide-up sm:animate-scale-in',
          'overflow-hidden',
          className
        )}
      >
        {/* Soft gold halo behind the header */}
        <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-56 sm:h-44', t.halo)} aria-hidden />
        {/* Top hairline sheen (desktop panel only) */}
        <div
          className="pointer-events-none absolute top-0 inset-x-[8%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent hidden sm:block"
          aria-hidden
        />

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] sm:top-4 z-20 w-10 h-10 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors backdrop-blur-sm"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Scrollable content */}
        <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-5 sm:px-7 pt-[max(2rem,env(safe-area-inset-top))] sm:pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {/* Constrain content width on large mobile/tablet so it never feels stretched */}
          <div className="w-full max-w-sm mx-auto">
            {/* Header */}
            <div className="text-center mb-6">
              <div
                className={cn(
                  'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4',
                  t.medallion
                )}
              >
                <Icon className={cn('w-8 h-8', t.icon)} strokeWidth={1.75} />
              </div>
              <h1
                className={cn(
                  'font-display text-[1.5rem] sm:text-[1.625rem] font-bold tracking-tight leading-tight',
                  t.title
                )}
              >
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-[19rem] mx-auto">
                  {subtitle}
                </p>
              )}
              {/* Editorial hairline divider */}
              <div className="mt-5 mx-auto w-14 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>

            {children}
          </div>
        </div>

        {/* Optional attached footer */}
        {footer && (
          <div className="relative z-10 flex-shrink-0 border-t border-border/50 px-5 sm:px-7 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="w-full max-w-sm mx-auto">{footer}</div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
