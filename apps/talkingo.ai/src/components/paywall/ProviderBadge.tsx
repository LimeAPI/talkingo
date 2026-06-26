'use client'

/**
 * ProviderBadge — small presentational chip that tells the subscriber which
 * payment provider powers their active subscription (e.g. "Powered by Stripe").
 *
 * Purely presentational: it takes a `provider` id and renders a friendly,
 * branded label. No data fetching, no side effects. Wired into
 * SubscriptionManager so the active subscription always shows its provider
 * transparently.
 *
 * _Requirements: 12.6_
 */

import { cn } from '@talkingo/shared/utils'
import { CreditCard } from 'lucide-react'
import type { ProviderId } from '@/lib/payments/provider'

interface ProviderBadgeProps {
  provider: ProviderId
  className?: string
}

/** Friendly, human-facing provider names used in the badge label. */
const PROVIDER_NAMES: Record<ProviderId, string> = {
  stripe: 'Stripe',
  dodopayments: 'DodoPayments',
}

export function ProviderBadge({ provider, className }: ProviderBadgeProps) {
  const name = PROVIDER_NAMES[provider]
  const label = `Powered by ${name}`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
        'border-border bg-muted/40 text-[11px] font-medium text-muted-foreground',
        className,
      )}
      title={label}
      aria-label={label}
    >
      <CreditCard className="w-3 h-3" aria-hidden />
      <span>
        Powered by <span className="font-semibold text-foreground">{name}</span>
      </span>
    </span>
  )
}
