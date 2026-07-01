'use client'

/**
 * InfoToast — generic non-blocking confirmation pill. Used by:
 * - Checkout cancelled ("No worries, you weren't charged")
 * - Billing updated ("Your subscription has been updated")
 * - Restore purchases success
 */

import { useEffect } from 'react'
import { X, Info, Check } from 'lucide-react'

interface InfoToastProps {
  message: string
  variant?: 'info' | 'success'
  onClose: () => void
  durationMs?: number
}

export function InfoToast({ message, variant = 'info', onClose, durationMs = 5000 }: InfoToastProps) {
  useEffect(() => {
    const id = setTimeout(onClose, durationMs)
    return () => clearTimeout(id)
  }, [onClose, durationMs])

  const Icon = variant === 'success' ? Check : Info
  const iconColor = variant === 'success' ? 'text-emerald-500' : 'text-muted-foreground'

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[500] animate-fade-in">
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-card border border-border/60 shadow-xl backdrop-blur-md max-w-sm">
        <Icon className={`w-4 h-4 ${iconColor} flex-shrink-0`} />
        <p className="text-sm text-foreground">{message}</p>
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
