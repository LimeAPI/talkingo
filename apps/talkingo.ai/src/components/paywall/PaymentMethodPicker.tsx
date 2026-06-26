'use client'

/**
 * PaymentMethodPicker
 *
 * A two-layer picker that:
 *   1. Fetches the recommended provider + supported methods for the user's
 *      region from /api/billing/recommend-provider.
 *   2. Lets the user see all available methods for both providers, with a
 *      clear "best for your region" badge on the recommended one.
 *
 * The picker is provider-agnostic and now owns checkout creation: when the
 * user confirms, it POSTs to the provider-agnostic /api/billing/checkout with
 * `{ provider, plan }`, handles loading + error states, and redirects to the
 * returned hosted-checkout URL. Payment methods are shown read-only ("here's
 * what each provider supports") — the actual method is chosen by the user on
 * the provider's hosted checkout page. The optional `onSelect` callback fires
 * with the chosen `{ provider }` (for analytics / parent state) and `onError`
 * surfaces a human-readable failure message.
 *
 * _Requirements: 4.6, 4.7, 4.8 (display, non-selectable disabled providers,
 * user override of the recommendation) plus checkout driving (5.x contract)._
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ChevronRight, Loader2, Shield, Check, Lock, Globe, Zap,
} from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import { authFetch } from '@/lib/api/auth-fetch'

export type PaymentProvider = 'stripe' | 'dodopayments'

export interface PaymentMethodOption {
  id: string
  label: string
  icon: string
}

export interface PaymentProviderOption {
  enabled: boolean
  methods: PaymentMethodOption[]
}

export interface PaymentPickerPayload {
  provider: PaymentProvider
}

interface PaymentMethodPickerProps {
  selectedPlan: 'monthly' | 'yearly' | 'trial'
  /** Notified with the chosen provider/method when the user confirms. */
  onSelect?: (payload: PaymentPickerPayload) => void
  /** Surfaces a human-readable failure message (recommend / checkout errors). */
  onError?: (message: string) => void
  className?: string
}

interface RecommendResponse {
  // The recommended provider, or '' when no provider is enabled (Req 4.5).
  recommended: PaymentProvider | ''
  providers: Record<PaymentProvider, PaymentProviderOption>
  region: { country: string | null; currency: string | null }
  enablementResolved?: boolean
}

const PROVIDER_ORDER: PaymentProvider[] = ['stripe', 'dodopayments']

const PROVIDER_LABELS: Record<PaymentProvider, { name: string; blurb: string }> = {
  stripe: {
    name: 'Stripe',
    blurb: 'Cards, Apple Pay, Google Pay, Link — works in 47+ countries',
  },
  dodopayments: {
    name: 'Dodo Payments',
    blurb: 'UPI, cards, net banking, local wallets — built for emerging markets',
  },
}

/**
 * Short, user-facing benefits for each provider. Surfaced under the active
 * provider so people can make an informed choice (Req 4.6 — transparent
 * "here's what each option gives you").
 */
const PROVIDER_BENEFITS: Record<PaymentProvider, string[]> = {
  stripe: [
    'One-tap Apple Pay, Google Pay & Link',
    'Trusted card processing in 47+ countries',
    'Instant access — no waiting on confirmation',
  ],
  dodopayments: [
    'Pay your way — UPI, wallets, net banking & local methods',
    'Billed in your local currency, no FX surprises',
    'Built for India, SE-Asia, LatAm & emerging markets',
  ],
}

// ─────────────────────────────────────────────────────────────────────────
// Region detection. recommend-provider now REQUIRES a valid ISO 3166-1 alpha-2
// country and ISO 4217 currency, so we derive both from the browser locale and
// fall back to a sensible default (US / USD) when they cannot be determined.
// ─────────────────────────────────────────────────────────────────────────

/** Common country → ISO 4217 currency map for the regions we recommend on. */
const COUNTRY_CURRENCY: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', IE: 'EUR', AU: 'AUD', NZ: 'NZD',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR',
  AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', PL: 'PLN', CZ: 'CZK',
  JP: 'JPY', SG: 'SGD', HK: 'HKD', KR: 'KRW', TW: 'TWD', ZA: 'ZAR',
  IN: 'INR', BD: 'BDT', PK: 'PKR', LK: 'LKR', NP: 'NPR',
  TH: 'THB', MY: 'MYR', PH: 'PHP', ID: 'IDR', VN: 'VND',
  SA: 'SAR', AE: 'AED', KW: 'KWD',
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
  NG: 'NGN', KE: 'KES',
}

function detectRegion(): { country: string; currency: string } {
  // navigator.language is e.g. "en-IN" or "hi-IN"; the region is the 2nd part.
  let country = 'US'
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language || ''
    const region = (lang.split('-')[1] || '').toUpperCase()
    if (/^[A-Z]{2}$/.test(region)) country = region
  }
  const currency = COUNTRY_CURRENCY[country] ?? 'USD'
  return { country, currency }
}

/** Map a checkout HTTP status / error code to a friendly message. */
function checkoutErrorMessage(status: number, code?: string, message?: string): string {
  switch (code) {
    case 'already_subscribed':
      return message || 'You already have an active subscription. Manage it from your profile.'
    case 'provider_unavailable':
      return 'The selected payment provider is unavailable right now. Try another option.'
    case 'rate_limited':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'invalid_provider':
    case 'invalid_plan':
      return 'That payment option isn\'t available for this plan. Try a different one.'
  }
  if (status === 401) return 'Please sign in to continue with checkout.'
  if (status === 403) return 'Checkout was blocked for security. Refresh the page and try again.'
  return 'Could not start checkout. Please try again.'
}

export function PaymentMethodPicker({
  selectedPlan,
  onSelect,
  onError,
  className,
}: PaymentMethodPickerProps) {
  const [data, setData] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeProvider, setActiveProvider] = useState<PaymentProvider | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const { country, currency } = detectRegion()

    const pickInitial = (d: RecommendResponse) => {
      // Prefer the recommended provider when it is enabled; otherwise fall back
      // to the first enabled provider so the picker opens on a usable option.
      const enabledFirst = PROVIDER_ORDER.find((p) => d.providers[p]?.enabled) ?? null
      const initial =
        d.recommended && d.providers[d.recommended as PaymentProvider]?.enabled
          ? (d.recommended as PaymentProvider)
          : enabledFirst
      setActiveProvider(initial)
    }

    fetch('/api/billing/recommend-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, currency }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`recommend failed: ${r.status}`)
        return r.json() as Promise<RecommendResponse>
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
        pickInitial(d)
      })
      .catch(() => {
        // Soft-fail: show Stripe as the default and let the user change it.
        if (cancelled) return
        const fallback: RecommendResponse = {
          recommended: 'stripe',
          providers: {
            stripe: { enabled: true, methods: [{ id: 'card', label: 'Credit / debit card', icon: '💳' }] },
            dodopayments: { enabled: false, methods: [] },
          },
          region: { country: null, currency: null },
          enablementResolved: false,
        }
        setData(fallback)
        pickInitial(fallback)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // The 5-day trial is Stripe-only (Dodo has no trial construct), so Dodo is
  // not a valid choice for that plan. Any other plan is supported by both.
  const supportsPlan = (provider: PaymentProvider) =>
    provider === 'stripe' || selectedPlan !== 'trial'

  // Both providers are always shown (Req 4.6); each carries its own enabled
  // flag which drives whether its control is selectable (Req 4.7). A provider
  // that doesn't support the current plan (Dodo + trial) is treated as disabled.
  const providers = useMemo(() => {
    if (!data) return [] as { id: PaymentProvider; enabled: boolean }[]
    return PROVIDER_ORDER.map((p) => ({
      id: p,
      enabled: !!data.providers[p]?.enabled && supportsPlan(p),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedPlan])

  const anyEnabled = providers.some((p) => p.enabled)

  // If the active provider becomes invalid for the selected plan (e.g. the user
  // switches to the trial plan while Dodo was selected), fall back to the first
  // provider that is both enabled and supports the plan.
  useEffect(() => {
    if (!data) return
    const activeOk =
      activeProvider &&
      data.providers[activeProvider]?.enabled &&
      supportsPlan(activeProvider)
    if (activeOk) return
    const next = PROVIDER_ORDER.find(
      (p) => data.providers[p]?.enabled && supportsPlan(p),
    ) ?? null
    setActiveProvider(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan, data])

  const reportError = (msg: string) => {
    setError(msg)
    onError?.(msg)
  }

  // Select a provider — only enabled providers that support the plan are
  // selectable (Req 4.7/4.8). The actual payment method is chosen by the user
  // on the provider's hosted checkout page (which always shows every method
  // supported for their region), so the picker only selects a provider here.
  const selectProvider = (provider: PaymentProvider) => {
    if (!data?.providers[provider]?.enabled || !supportsPlan(provider)) return
    setError(null)
    setActiveProvider(provider)
  }

  // Confirm → drive provider-agnostic checkout.
  const handleContinue = async () => {
    if (!activeProvider) return
    if (!data?.providers[activeProvider]?.enabled || !supportsPlan(activeProvider)) return

    setError(null)
    onSelect?.({ provider: activeProvider })

    setCheckingOut(true)
    try {
      const res = await authFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          plan: selectedPlan,
        }),
      })
      const payload = await res.json().catch(() => ({}))

      if (res.ok && payload?.url) {
        // Redirect to the hosted checkout. Keep the loading state so the button
        // stays disabled while the browser navigates away.
        window.location.href = payload.url
        return
      }

      reportError(checkoutErrorMessage(res.status, payload?.error, payload?.message))
      setCheckingOut(false)
    } catch {
      reportError('Connection issue. Check your network and try again.')
      setCheckingOut(false)
    }
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className={cn('space-y-4', className)}>
      {/* ── Provider tabs (both providers always shown) ───────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {providers.map(({ id: provider, enabled }) => {
          const meta = PROVIDER_LABELS[provider]
          const isActive = activeProvider === provider
          const isRecommended = enabled && data.recommended === provider
          // Distinguish *why* a provider is unavailable so the copy is honest:
          // region/credentials vs. simply not supporting the trial plan.
          const regionEnabled = !!data.providers[provider]?.enabled
          const disabledReason = !regionEnabled
            ? 'Not available in your region'
            : !supportsPlan(provider)
              ? 'Not available for the 5-day trial'
              : null
          return (
            <button
              key={provider}
              type="button"
              onClick={() => selectProvider(provider)}
              disabled={!enabled || checkingOut}
              aria-pressed={isActive}
              aria-disabled={!enabled}
              className={cn(
                'relative text-left p-3.5 rounded-xl border transition-all',
                !enabled
                  ? 'border-border/50 bg-muted/30 opacity-60 cursor-not-allowed'
                  : isActive
                    ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                    : 'border-border bg-card hover:border-accent/40 hover:bg-accent/[0.02]',
              )}
            >
              {isRecommended && (
                <span className="absolute -top-2 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold uppercase tracking-wider shadow-sm">
                  <Sparkles className="w-2.5 h-2.5" />
                  Best for you
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    {meta.name}
                    {!enabled && <Lock className="w-3 h-3 text-muted-foreground" aria-hidden />}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {enabled ? meta.blurb : disabledReason}
                  </div>
                </div>
                {isActive && enabled && (
                  <Check className="w-4 h-4 text-accent shrink-0" strokeWidth={2.5} />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Method picker (per active provider) ───────────────────────── */}
      <AnimatePresence mode="wait">
        {activeProvider && data.providers[activeProvider]?.enabled && (
          <motion.div
            key={activeProvider}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-1">
              Supported payment methods
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {data.providers[activeProvider].methods.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border bg-card/60 text-center"
                >
                  <span className="text-xl leading-none" aria-hidden>{m.icon}</span>
                  <span className="text-[11px] font-medium leading-tight">{m.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground px-1 leading-snug">
              You&apos;ll choose how to pay securely on the next screen.
            </p>

            {/* ── Why this provider — transparent benefits (Req 4.6) ───── */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">
                {activeProvider === 'dodopayments' ? (
                  <Globe className="w-3 h-3 text-accent" />
                ) : (
                  <Zap className="w-3 h-3 text-accent" />
                )}
                Why {PROVIDER_LABELS[activeProvider].name}
              </div>
              <ul className="space-y-1">
                {PROVIDER_BENEFITS[activeProvider].map((benefit) => (
                  <li key={benefit} className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                    <Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" strokeWidth={2.5} />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── No-provider state (Req 4.5: none enabled) ─────────────────── */}
      {!anyEnabled && (
        <div className="text-center text-xs text-muted-foreground px-3 py-2.5 rounded-xl bg-muted/40 border border-border/50">
          Online payments aren&apos;t available in your region yet. Please check back soon.
        </div>
      )}

      {/* ── Inline error ──────────────────────────────────────────────── */}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 text-center px-2" role="alert">
          {error}
        </p>
      )}

      {/* ── Confirm CTA ───────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleContinue}
        disabled={!activeProvider || checkingOut || !anyEnabled}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl',
          'bg-accent text-accent-foreground font-semibold text-sm',
          'shadow-sm hover:opacity-90 active:scale-[0.99] transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {checkingOut ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Starting checkout…
          </>
        ) : (
          <>
            Continue with {activeProvider ? PROVIDER_LABELS[activeProvider].name : ''}
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* ── Trust strip ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
        <Shield className="w-3 h-3" />
        Encrypted checkout · cancel anytime
      </div>
    </div>
  )
}
