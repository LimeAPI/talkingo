'use client'

/**
 * CheckoutReturnHandler
 *
 * Mounted on the post-checkout return route. When a hosted checkout redirects
 * back with `?provider=..&status=success&session_id=..`, this component confirms
 * the subscription so the user sees Premium immediately — even if the provider
 * webhook has not fired yet ("never lose a payment").
 *
 * Flow (Requirement 6):
 *   1. Read `provider`, `status`, `session_id` from the URL. Only act when
 *      `status === 'success'` and both `provider` and `session_id` are present (6.1).
 *   2. POST /api/billing/sync-checkout with { provider, sessionId }.
 *      - On a transient failure (network error or 5xx), retry up to 3 ADDITIONAL
 *        times with exponential backoff: 1s → 2s → 4s → 8s, capped at 8s (6.2).
 *        After exhausting retries, show an "activation could not be confirmed"
 *        error (6.3).
 *      - On 200 with a snapshot → persist via use-subscription and show success (6.6).
 *      - On 202 not-ready → poll POST /api/billing/status every 2s for up to 60s
 *        until the subscription is `active`/`trialing` (6.8). If 60s elapses
 *        without finalization, show an "activation is delayed" error (6.9).
 *      - On a non-transient error (4xx other than 202) → "could not confirm" error.
 *
 * The component never mutates server state on its own — it only reads it back.
 * Ownership / tampered-price safety is enforced server-side by the provider.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Sparkles, Check, AlertCircle, Crown } from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import { authFetch } from '@/lib/api/auth-fetch'
import {
  saveSubscriptionInfo,
  type SubscriptionInfo,
  type SubscriptionStatus,
  type SubscriptionProvider,
} from '@/lib/subscription/use-subscription'

// ── Tuning constants (mirrors Requirement 6) ──────────────────────────────────
/** Additional sync retries after the first attempt (6.2). */
const MAX_SYNC_RETRIES = 3
/** Exponential backoff base, in ms (6.2). */
const BACKOFF_BASE_MS = 1_000
/** Backoff ceiling, in ms (6.2). */
const BACKOFF_CAP_MS = 8_000
/** Status poll interval while a sync is pending (6.8). */
const POLL_INTERVAL_MS = 2_000
/** Total polling budget before giving up (6.8, 6.9). */
const POLL_TIMEOUT_MS = 60_000

type Phase = 'idle' | 'confirming' | 'success' | 'error'
type ErrorKind = 'could-not-confirm' | 'delayed'

export interface CheckoutReturnHandlerProps {
  /**
   * Optional user id used to scope the persisted subscription cache. When the
   * caller knows the signed-in user, pass it so the cache key matches the rest
   * of the app's per-user storage.
   */
  userId?: string | null
  /** Called once with the confirmed snapshot when activation succeeds. */
  onSuccess?: (info: SubscriptionInfo) => void
  /** Called when activation fails or is delayed past the polling budget. */
  onError?: (kind: ErrorKind) => void
  className?: string
}

interface SyncSuccessShape {
  provider?: SubscriptionProvider
  status?: SubscriptionStatus
  plan?: 'monthly' | 'yearly'
  providerCustomerId?: string
  trialEnd?: number
  periodEnd?: number
  cancelAtPeriodEnd?: boolean
}

interface StatusShape {
  status?: SubscriptionStatus
  plan?: 'monthly' | 'yearly'
  customerId?: string
  trialEndsAt?: number
  currentPeriodEnd?: number
  cancelAtPeriodEnd?: boolean
  provider?: SubscriptionProvider
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Backoff for the Nth retry (0-indexed): 1s, 2s, 4s, 8s — capped at 8s (6.2). */
function backoffFor(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS)
}

/** A finalized subscription is one that grants premium access. */
function isFinalized(status?: string): boolean {
  return status === 'active' || status === 'trialing'
}

/** Map the sync-checkout 200 snapshot into the client cache shape. */
function snapshotToInfo(s: SyncSuccessShape): SubscriptionInfo {
  return {
    status: (s.status as SubscriptionStatus) ?? 'active',
    plan: s.plan,
    customerId: s.providerCustomerId,
    trialEndsAt: s.trialEnd,
    currentPeriodEnd: s.periodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
    provider: s.provider,
  }
}

/** Map the status route response into the client cache shape. */
function statusToInfo(s: StatusShape): SubscriptionInfo {
  return {
    status: (s.status as SubscriptionStatus) ?? 'none',
    plan: s.plan,
    customerId: s.customerId,
    trialEndsAt: s.trialEndsAt,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
    provider: s.provider,
  }
}

export function CheckoutReturnHandler({
  userId,
  onSuccess,
  onError,
  className,
}: CheckoutReturnHandlerProps) {
  const searchParams = useSearchParams()
  const provider = searchParams.get('provider')
  const status = searchParams.get('status')
  // Stripe substitutes `session_id`; DodoPayments appends `subscription_id` to
  // the return URL (its subscription id IS the sessionId that the provider's
  // syncFromCheckout expects). Accept either so both providers land here (6.1).
  const sessionId = searchParams.get('session_id') ?? searchParams.get('subscription_id')

  const [phase, setPhase] = useState<Phase>('idle')
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null)
  const [activated, setActivated] = useState<SubscriptionInfo | null>(null)

  // Guards: avoid running the confirmation flow twice (e.g. React strict mode)
  // and avoid updating state after the component has unmounted.
  const startedRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const finishSuccess = useCallback(
    (info: SubscriptionInfo) => {
      saveSubscriptionInfo(info, userId)
      if (!mountedRef.current) return
      setActivated(info)
      setPhase('success')
      onSuccess?.(info)
    },
    [userId, onSuccess],
  )

  const finishError = useCallback(
    (kind: ErrorKind) => {
      if (!mountedRef.current) return
      setErrorKind(kind)
      setPhase('error')
      onError?.(kind)
    },
    [onError],
  )

  /**
   * Poll the status route every 2s until the subscription is finalized or the
   * 60s budget elapses (6.8, 6.9). Network/server errors during a poll are
   * treated as "not finalized yet" and simply retried on the next tick.
   */
  const pollStatus = useCallback(async (): Promise<void> => {
    const deadline = Date.now() + POLL_TIMEOUT_MS

    while (Date.now() < deadline) {
      if (!mountedRef.current) return
      try {
        const res = await authFetch('/api/billing/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as StatusShape
          if (isFinalized(data.status)) {
            finishSuccess(statusToInfo(data))
            return
          }
        }
      } catch {
        // Transient — keep polling until the deadline.
      }
      await sleep(POLL_INTERVAL_MS)
    }

    // 60s elapsed without finalization (6.9).
    finishError('delayed')
  }, [finishSuccess, finishError])

  /**
   * Call sync-checkout with exponential-backoff retries (6.2). Returns when a
   * terminal outcome (success / 202-poll / hard error) has been reached.
   */
  const runSync = useCallback(
    async (p: string, sid: string): Promise<void> => {
      // 1 initial attempt + MAX_SYNC_RETRIES additional attempts.
      for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt++) {
        if (!mountedRef.current) return

        let transient = false
        try {
          const res = await authFetch('/api/billing/sync-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: p, sessionId: sid }),
          })

          if (res.ok) {
            // 200 — confirmed snapshot, persist and celebrate (6.6).
            const data = (await res.json().catch(() => ({}))) as SyncSuccessShape
            finishSuccess(snapshotToInfo(data))
            return
          }

          if (res.status === 202) {
            // Pending — hand off to status polling (6.8).
            await pollStatus()
            return
          }

          if (res.status >= 500) {
            // Server-side error — transient, eligible for retry (6.2).
            transient = true
          } else {
            // 4xx (forbidden / invalid price / bad request) — not retryable.
            finishError('could-not-confirm')
            return
          }
        } catch {
          // Network error / timeout — transient, eligible for retry (6.2).
          transient = true
        }

        if (transient && attempt < MAX_SYNC_RETRIES) {
          await sleep(backoffFor(attempt))
          continue
        }
        // Either non-transient (handled above) or retries exhausted.
        break
      }

      // Exhausted all retries on transient failures (6.3).
      finishError('could-not-confirm')
    },
    [finishSuccess, finishError, pollStatus],
  )

  useEffect(() => {
    // Only act on a successful return with both identifiers present (6.1).
    if (status !== 'success' || !provider || !sessionId) return
    if (startedRef.current) return
    startedRef.current = true

    setPhase('confirming')
    void runSync(provider, sessionId)
  }, [status, provider, sessionId, runSync])

  // ── Render ──────────────────────────────────────────────────────────────
  // Nothing to do when this isn't a successful checkout return.
  if (status !== 'success' || !provider || !sessionId) return null

  return (
    <div
      className={cn(
        'w-full max-w-sm mx-auto rounded-2xl bg-card/50 border border-border/40 p-6 text-center space-y-4',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {(phase === 'confirming' || phase === 'idle') && (
        <>
          <div className="w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/25 flex items-center justify-center mx-auto shadow-[0_0_36px_-10px_oklch(var(--primary)/0.4)]">
            <Loader2 className="w-7 h-7 text-primary animate-spin" strokeWidth={1.75} />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold tracking-tight">Confirming your subscription…</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Hang tight while we activate your Premium access. This usually takes a few seconds.
            </p>
          </div>
        </>
      )}

      {phase === 'success' && (
        <>
          <div className="w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/30 flex items-center justify-center mx-auto shadow-[0_0_40px_-10px_oklch(var(--primary)/0.45)]">
            <Sparkles className="w-7 h-7 text-primary" strokeWidth={1.75} />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold tracking-tight flex items-center justify-center gap-1.5">
              <Crown className="w-4 h-4 text-primary" />
              Premium activated
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {activated?.status === 'trialing'
                ? 'Your trial is now active — enjoy full access.'
                : 'Your subscription is now active — enjoy full access.'}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" />
            All set
          </div>
        </>
      )}

      {phase === 'error' && (
        <>
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold tracking-tight">
              {errorKind === 'delayed'
                ? 'Activation is taking longer than expected'
                : 'We couldn’t confirm your subscription'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {errorKind === 'delayed'
                ? 'Your payment may still be processing. If you completed payment, your Premium access will appear shortly — check back in a few minutes or refresh your profile.'
                : 'Your payment may not have completed, or we couldn’t reach the payment provider. If you were charged, your access will be restored automatically — no need to pay again.'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

export default CheckoutReturnHandler
