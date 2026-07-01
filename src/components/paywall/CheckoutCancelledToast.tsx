'use client'

/**
 * CheckoutCancelledToast — soft, non-blocking toast shown when a user backs
 * out of checkout (any provider). Reassures them that nothing was charged and
 * they can subscribe later. Auto-dismisses after a few seconds.
 */

import { useEffect } from 'react'
import { X, Info } from 'lucide-react'

interface CheckoutCancelledToastProps {
  onClose: () => void
  durationMs?: number
}

export function CheckoutCancelledToast({ onClose, durationMs = 6000 }: CheckoutCancelledToastProps) {
  useEffect(() => {
    const id = setTimeout(onClose, durationMs)
    return () => clearTimeout(id)
  }, [onClose, durationMs])

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[500] animate-fade-in">
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-card border border-border/60 shadow-xl backdrop-blur-md max-w-sm">
        <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <p className="text-sm text-foreground">
          No worries — you weren&apos;t charged. Subscribe anytime.
        </p>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md hover:bg-muted/50 flex items-center justify-center transition-colors flex-shrink-0"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}
