'use client'

/**
 * CancellationBanner — dismissible info bar shown to users who cancelled
 * their subscription but still have access until the period end. Surfaces
 * the end date so it isn't a surprise, and offers a one-tap reactivate.
 */

import { AlertCircle, X } from 'lucide-react'
import { useState } from 'react'
import { getCancellationLabel, getNextBillingLabel } from '@/lib/subscription/use-subscription'

interface CancellationBannerProps {
  userId?: string | null
  onReactivate?: () => void
}

export function CancellationBanner({ userId, onReactivate }: CancellationBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const label = getCancellationLabel(userId)
  const date = getNextBillingLabel(userId)

  if (!label || dismissed) return null

  return (
    <div className="px-3 pt-3">
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
        <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <p className="flex-1 text-amber-700 dark:text-amber-400 font-medium">
          {label}
          {date ? ` (${date})` : ''}
        </p>
        {onReactivate && (
          <button
            onClick={onReactivate}
            className="px-2 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-semibold text-amber-700 dark:text-amber-400 transition-colors"
          >
            Reactivate
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="w-5 h-5 rounded hover:bg-amber-500/20 flex items-center justify-center transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3 h-3 text-amber-600 dark:text-amber-400" />
        </button>
      </div>
    </div>
  )
}
