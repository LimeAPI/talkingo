'use client'

/**
 * PaymentMethodPicker — method-first checkout.
 *
 * Users think in *ways to pay* (card, UPI, Apple Pay, local wallets), not in
 * payment processors. So this surface leads with a single, unified list of
 * every method available for the user's region, drawn from all enabled
 * providers and de-duplicated. The processor (Stripe / Dodo) is resolved
 * silently behind each method and shown only as a subtle "Powered by …" line.
 *
 * Routing model:
 *   - Each method maps to exactly one provider for checkout. When only one
 *     provider offers a method (e.g. UPI → Dodo) it routes there. When both
 *     offer it (cards, Apple/Google Pay) it routes to the *recommended*
 *     provider for the region, falling back to whichever is enabled.
 *   - Ordering puts the recommended provider's methods first, so the most
 *     region-relevant options lead (India → UPI; US → card / Apple Pay / Link).
 *
 * Honesty: the real method is still chosen on the provider's hosted checkout
 * page (which lists every method it supports), so selecting a method here is a
 * routing + preference signal, not a hard lock — copy is phrased accordingly.
 *
 * On confirm, POSTs to the provider-agnostic /api/billing/checkout with
 * `{ provider, plan, method }` and redirects to the returned hosted-checkout
 * URL. `onSelect` fires with the resolved `{ provider }`; `onError` surfaces a
 * human-readable failure message.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Loader2, Check, Lock, ShieldCheck } from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import { authFetch } from '@/lib/api/auth-fetch'
import { planCtaLabel } from '@/lib/subscription/public-plans'
import { captureReferralFromUrl, getStoredPromoCode } from '@/lib/subscription/referral'
import { ProviderWordmark, methodChips } from './shared/PaymentBrandIcons'

export type PaymentProvider = 'stripe' | 'dodopayments'

export interface PaymentMethodOption {
  id: string
  label: string
  icon: string
}

export interface PaymentProviderOption {
  enabled: boolean
  methods: PaymentMethodOption[]
  /** Whether this provider can offer the $5 / 5-day trial (needs a trial product configured). */
  trialSupported?: boolean
}

export interface PaymentPickerPayload {
  provider: PaymentProvider
}

interface PaymentMethodPickerProps {
  selectedPlan: 'monthly' | 'yearly' | 'trial'
  /** Notified with the resolved provider when the user confirms. */
  onSelect?: (payload: PaymentPickerPayload) => void
  /** Surfaces a human-readable failure message (recommend / checkout errors). */
  onError?: (message: string) => void
  className?: string
}

interface RecommendResponse {
  recommended: PaymentProvider | ''
  providers: Record<PaymentProvider, PaymentProviderOption>
  region: { country: string | null; currency: string | null }
  enablementResolved?: boolean
}

/** A method resolved to the single provider that will fulfill its checkout. */
interface UnifiedMethod {
  id: string
  provider: PaymentProvider
  rawLabel: string
}

const PROVIDER_ORDER: PaymentProvider[] = ['stripe', 'dodopayments']

/**
 * Providers intentionally not live yet — hidden from routing entirely. Empty
 * means every configured provider is live.
 */
const COMING_SOON_PROVIDERS = new Set<PaymentProvider>([])
const isComingSoon = (provider: PaymentProvider): boolean => COMING_SOON_PROVIDERS.has(provider)

// ─────────────────────────────────────────────────────────────────────────
// Per-method copy. A friendly label + a one-line "what it is" so the list
// teaches at a glance instead of dumping bare names. Brand glyphs come from
// PaymentBrandIcons; this is purely the words.
// ─────────────────────────────────────────────────────────────────────────

const METHOD_META: Record<string, { label: string; desc: string }> = {
  card: { label: 'Credit or debit card', desc: 'Visa, Mastercard, Amex & more' },
  apple_pay: { label: 'Apple Pay', desc: 'One-tap with Face ID or Touch ID' },
  google_pay: { label: 'Google Pay', desc: 'One-tap from your Google account' },
  link: { label: 'Link', desc: 'Stripe’s 1-click saved checkout' },
  upi: { label: 'UPI', desc: 'GPay, PhonePe, Paytm & any UPI app' },
  netbanking: { label: 'Net banking', desc: 'Pay straight from your bank' },
  wallets: { label: 'Wallets', desc: 'Paytm, Amazon Pay & popular wallets' },
  ewallet: { label: 'E-wallet', desc: 'OVO, DANA, GoPay & local wallets' },
  promptpay: { label: 'PromptPay', desc: 'Scan & pay with a QR code' },
  fpx: { label: 'FPX', desc: 'Malaysian online banking' },
  gcash: { label: 'GCash', desc: 'Pay with your GCash balance' },
  mada: { label: 'mada', desc: 'Saudi debit network' },
  knet: { label: 'KNET', desc: 'Kuwait debit network' },
  pix: { label: 'Pix', desc: 'Instant bank transfer via QR' },
  boleto: { label: 'Boleto', desc: 'Pay at a bank or online' },
  mpesa: { label: 'M-Pesa', desc: 'Mobile money payments' },
}

const methodMeta = (id: string, fallbackLabel: string) =>
  METHOD_META[id] ?? { label: fallbackLabel, desc: '' }

// ─────────────────────────────────────────────────────────────────────────
// Region detection. recommend-provider REQUIRES a valid ISO 3166-1 alpha-2
// country and ISO 4217 currency, derived from the browser locale with a
// sensible default (US / USD).
// ─────────────────────────────────────────────────────────────────────────

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
    case 'payment_past_due':
      return (
        message ||
        'Your last payment failed. Update your payment method from your profile to restore access.'
      )
    case 'provider_unavailable':
      return 'That payment option is unavailable right now. Try another method.'
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
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const { country, currency } = detectRegion()

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
        if (!cancelled) setData(d)
      })
      .catch(() => {
        // Soft-fail: a usable card-only default so checkout still works.
        if (cancelled) return
        setData({
          recommended: 'stripe',
          providers: {
            stripe: {
              enabled: true,
              trialSupported: true,
              methods: [
                { id: 'card', label: 'Credit / debit card', icon: '💳' },
                { id: 'apple_pay', label: 'Apple Pay', icon: '🍎' },
                { id: 'google_pay', label: 'Google Pay', icon: '🟢' },
              ],
            },
            dodopayments: { enabled: false, trialSupported: false, methods: [] },
          },
          region: { country: null, currency: null },
          enablementResolved: false,
        })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // A provider qualifies for the current plan when it's enabled, live, and
  // (for the trial) has a configured trial product.
  const supportsPlan = (provider: PaymentProvider) => {
    if (!data?.providers[provider]?.enabled || isComingSoon(provider)) return false
    if (selectedPlan !== 'trial') return true
    return !!data.providers[provider]?.trialSupported
  }

  // Unified, de-duplicated, region-ordered method list. The recommended
  // provider's methods lead so the most relevant options surface first; each
  // method is tagged with the single provider that will fulfill its checkout.
  const methods = useMemo<UnifiedMethod[]>(() => {
    if (!data) return []
    const eligible = PROVIDER_ORDER.filter((p) => supportsPlan(p))
    const ordered =
      data.recommended && eligible.includes(data.recommended as PaymentProvider)
        ? [data.recommended as PaymentProvider, ...eligible.filter((p) => p !== data.recommended)]
        : eligible

    const out: UnifiedMethod[] = []
    const seen = new Set<string>()
    for (const provider of ordered) {
      for (const m of data.providers[provider].methods) {
        if (seen.has(m.id)) continue
        seen.add(m.id)
        out.push({ id: m.id, provider, rawLabel: m.label })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedPlan])

  // Keep the selection valid as the list changes (plan switch, late data).
  useEffect(() => {
    if (methods.length === 0) {
      if (selectedMethodId !== null) setSelectedMethodId(null)
      return
    }
    if (!selectedMethodId || !methods.some((m) => m.id === selectedMethodId)) {
      setSelectedMethodId(methods[0].id)
    }
  }, [methods, selectedMethodId])

  const selectedMethod = methods.find((m) => m.id === selectedMethodId) ?? null
  const resolvedProvider = selectedMethod?.provider ?? null
  const hasMethods = methods.length > 0

  const reportError = (msg: string) => {
    setError(msg)
    onError?.(msg)
  }

  const selectMethod = (id: string) => {
    setError(null)
    setSelectedMethodId(id)
  }

  // Confirm → resolve the provider for the chosen method and drive checkout.
  const handleContinue = async () => {
    if (!resolvedProvider || !selectedMethod) return
    setError(null)
    onSelect?.({ provider: resolvedProvider })

    setCheckingOut(true)
    try {
      // Pass the detected country so the hosted checkout localizes currency +
      // regional methods (e.g. UPI for IN). The server still prefers a trusted
      // geo header when present and validates the value.
      const { country } = detectRegion()
      // Auto-apply a referral/promo code captured from the landing link (or a
      // previously-stored one). Re-capture from the current URL first in case
      // the paywall was reached directly via a `?ref=` link. A missing/invalid
      // code is simply omitted — the server ignores unknown codes.
      captureReferralFromUrl()
      const promoCode = getStoredPromoCode()
      const res = await authFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `method` is a hint the provider may use to prioritize the chosen
        // rail on its hosted page. Harmless if ignored; keeps the user's
        // selection wired end-to-end instead of being thrown away.
        body: JSON.stringify({
          provider: resolvedProvider,
          plan: selectedPlan,
          method: selectedMethod.id,
          country,
          ...(promoCode ? { promoCode } : {}),
        }),
      })
      const payload = await res.json().catch(() => ({}))

      if (res.ok && payload?.url) {
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
      <div className={cn('flex items-center justify-center py-10', className)}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) return null

  // No method available for this region / plan.
  if (!hasMethods) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="text-center text-sm text-muted-foreground px-3 py-3 rounded-xl bg-muted/40 border border-border/50">
          {selectedPlan === 'trial'
            ? 'The 5-day trial isn’t available in your region yet. Choose the monthly or yearly plan to continue.'
            : 'Online payments aren’t available in your region yet. Please check back soon.'}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Section label */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          How would you like to pay?
        </span>
      </div>

      {/* ── Method list ─────────────────────────────────────────────────── */}
      <div role="radiogroup" aria-label="Choose a payment method" className="space-y-2">
        {methods.map((m, i) => {
          const meta = methodMeta(m.id, m.rawLabel)
          const chips = methodChips(m.id)
          const isSelected = selectedMethodId === m.id
          const isTop = i === 0 && methods.length > 1 && m.provider === data.recommended

          return (
            <motion.button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={checkingOut}
              onClick={() => selectMethod(m.id)}
              aria-label={`${meta.label}${meta.desc ? `, ${meta.desc}` : ''}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(i * 0.035, 0.2), ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'group relative w-full rounded-2xl p-3.5 text-left',
                'flex items-center gap-3 transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                'disabled:cursor-not-allowed',
                isSelected
                  ? 'border border-primary/60 ring-2 ring-primary/50 bg-gradient-to-br from-primary/[0.10] to-primary/[0.03] shadow-[0_0_28px_-10px_oklch(var(--primary)/0.45)]'
                  : 'border border-border/60 bg-card hover:border-primary/40',
              )}
            >
              {/* Recommended tag on the lead method */}
              {isTop && (
                <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-primary to-primary-glow text-[oklch(var(--primary-foreground))] text-[10px] font-bold uppercase tracking-wider shadow-[0_4px_12px_-4px_oklch(var(--primary)/0.6)]">
                  <Sparkles className="w-2.5 h-2.5" />
                  Recommended
                </span>
              )}

              {/* Brand logo(s) */}
              <span className="flex items-center gap-1 flex-shrink-0">
                {chips.map((c) => (
                  <span key={c.key} className="contents">{c.node}</span>
                ))}
              </span>

              {/* Label + description */}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-foreground leading-tight">
                  {meta.label}
                </span>
                {meta.desc && (
                  <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                    {meta.desc}
                  </span>
                )}
              </span>

              {/* Selection indicator */}
              <span
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                  isSelected ? 'bg-primary' : 'border-2 border-border',
                )}
                aria-hidden
              >
                {isSelected && (
                  <Check className="w-3 h-3 text-[oklch(var(--primary-foreground))]" strokeWidth={3} />
                )}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* ── Inline error ──────────────────────────────────────────────── */}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 text-center px-2" role="alert">
          {error}
        </p>
      )}

      {/* ── Trial terms ───────────────────────────────────────────────── */}
      {selectedPlan === 'trial' && (
        <p className="text-[11px] text-center text-muted-foreground px-2 leading-snug">
          $5 for a 5-day trial — then $30/mo. Cancel anytime before billing.
        </p>
      )}

      {/* ── Confirm CTA ───────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleContinue}
        disabled={!resolvedProvider || checkingOut}
        className={cn(
          'btn-gradient w-full justify-center text-[0.9375rem] py-3.5 mt-1',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none',
        )}
      >
        {checkingOut ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Starting secure checkout…
          </>
        ) : (
          planCtaLabel(selectedPlan)
        )}
      </button>

      {/* ── Trust + powered-by ────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-1.5 pt-0.5">
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/90">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2} />
          <span>Encrypted &amp; secure</span>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1">
            <Lock className="w-3 h-3" strokeWidth={2} />
            Cancel anytime
          </span>
        </div>
        {resolvedProvider && (
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/70">
            <span>Securely powered by</span>
            <ProviderWordmark provider={resolvedProvider} className="h-3 w-auto opacity-80" />
          </div>
        )}
      </div>
    </div>
  )
}
