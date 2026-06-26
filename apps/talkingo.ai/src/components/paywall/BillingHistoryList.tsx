'use client'

/**
 * BillingHistoryList — renders the subscriber's unified billing history.
 *
 * Fetches `GET /api/billing/history` (provider-agnostic) and renders one
 * uniform list regardless of whether Stripe or DodoPayments powers the
 * subscription. Each row shows the invoice date, formatted amount + currency,
 * status, the issuing provider, and — when available — a link to the hosted
 * receipt. The route already orders invoices date-descending and returns each
 * `date` as an ISO string.
 *
 * Handles three async states explicitly: loading, empty ("No billing history
 * yet"), and error.
 *
 * _Requirements: 12.1_
 */

import { useEffect, useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Loader2, ExternalLink, ReceiptText, AlertCircle } from 'lucide-react'
import { authFetch } from '@/lib/api/auth-fetch'
import { ProviderBadge } from './ProviderBadge'
import type { ProviderId } from '@/lib/payments/provider'

/** Shape of a single invoice as returned by `GET /api/billing/history`. */
interface BillingHistoryInvoice {
  id: string
  /** ISO 8601 string (issue date). */
  date: string
  /** Amount in the currency's major unit. */
  amount: number
  /** ISO 4217 currency code. */
  currency: string
  /** Provider-native status (e.g. 'paid', 'succeeded', 'open'). */
  status: string
  provider: ProviderId
  /** Optional hosted receipt URL. */
  receiptUrl?: string
}

interface BillingHistoryResponse {
  invoices: BillingHistoryInvoice[]
}

interface BillingHistoryListProps {
  className?: string
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; invoices: BillingHistoryInvoice[] }

/** Format an amount + ISO currency code for display, with a safe fallback. */
function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount)
  } catch {
    // Unknown/invalid currency code — fall back to a plain numeric display.
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}

/** Format an ISO date string for display, tolerating malformed values. */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

/** Map common provider statuses to badge colors; default to a neutral chip. */
function statusClass(status: string): string {
  const s = status.toLowerCase()
  if (s === 'paid' || s === 'succeeded' || s === 'active') {
    return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
  }
  if (s === 'open' || s === 'pending' || s === 'processing') {
    return 'text-amber-600 bg-amber-500/10 border-amber-500/20'
  }
  if (s === 'failed' || s === 'uncollectible' || s === 'void' || s === 'canceled') {
    return 'text-red-600 bg-red-500/10 border-red-500/20'
  }
  return 'text-muted-foreground bg-muted/50 border-border'
}

export function BillingHistoryList({ className }: BillingHistoryListProps) {
  const [state, setState] = useState<LoadState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false

    authFetch('/api/billing/history')
      .then(async (res) => {
        if (!res.ok) throw new Error(`history request failed: ${res.status}`)
        const data: BillingHistoryResponse = await res.json()
        if (cancelled) return
        setState({ phase: 'ready', invoices: data.invoices ?? [] })
      })
      .catch(() => {
        if (cancelled) return
        setState({ phase: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  // ── Loading ────────────────────────────────────────────────────────────
  if (state.phase === 'loading') {
    return (
      <div className={cn('flex items-center justify-center py-10', className)}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600',
          className,
        )}
        role="alert"
      >
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Couldn&apos;t load your billing history. Please try again later.</span>
      </div>
    )
  }

  // ── Empty ──────────────────────────────────────────────────────────────
  if (state.invoices.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 py-10 text-center',
          className,
        )}
      >
        <ReceiptText className="w-6 h-6 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">No billing history yet</p>
      </div>
    )
  }

  // ── Ready ──────────────────────────────────────────────────────────────
  return (
    <ul className={cn('flex flex-col divide-y divide-border rounded-xl border border-border bg-card', className)}>
      {state.invoices.map((invoice) => (
        <li
          key={invoice.id}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {formatAmount(invoice.amount, invoice.currency)}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  statusClass(invoice.status),
                )}
              >
                {invoice.status}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{formatDate(invoice.date)}</span>
              <span aria-hidden>·</span>
              <ProviderBadge provider={invoice.provider} />
            </div>
          </div>

          {invoice.receiptUrl && (
            <a
              href={invoice.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-accent/[0.03]"
            >
              Receipt
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
