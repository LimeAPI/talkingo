'use client'

/**
 * PaymentBrandIcons — a small, dependency-free set of recognizable payment
 * brand marks (card networks, wallets, providers) drawn as inline SVG so they
 * stay crisp at any size, theme-agnostic, and add nothing to the bundle.
 *
 * These are intentionally simplified, legible marks used to communicate
 * "here's what you can pay with" — not pixel-exact corporate logos. Each
 * renders inside a uniform light "chip" via <BrandChip> so a row of mixed
 * brands reads as a tidy, trustworthy strip.
 */

import {
  CreditCard, Wallet, Smartphone, Landmark, QrCode, type LucideIcon,
} from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import type { ReactNode } from 'react'

type MarkProps = { className?: string }

const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'

/* ── Card networks ──────────────────────────────────────────────────────── */

export function VisaMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 16" className={className} role="img" aria-label="Visa">
      <text x="24" y="13" textAnchor="middle" fontFamily={FONT} fontSize="14" fontStyle="italic" fontWeight={800} letterSpacing="-0.5" fill="#1434CB">VISA</text>
    </svg>
  )
}

export function MastercardMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 40 24" className={className} role="img" aria-label="Mastercard">
      <circle cx="15" cy="12" r="9.5" fill="#EB001B" />
      <circle cx="25" cy="12" r="9.5" fill="#F79E1B" />
      <path d="M20 4.6a9.5 9.5 0 0 1 0 14.8 9.5 9.5 0 0 1 0-14.8Z" fill="#FF5F00" />
    </svg>
  )
}

export function AmexMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 18" className={className} role="img" aria-label="American Express">
      <rect width="48" height="18" rx="3" fill="#1F72CD" />
      <text x="24" y="12.5" textAnchor="middle" fontFamily={FONT} fontSize="8" fontWeight={800} letterSpacing="0.5" fill="#fff">AMEX</text>
    </svg>
  )
}

/* ── Wallets ────────────────────────────────────────────────────────────── */

export function ApplePayMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 44 18" className={className} role="img" aria-label="Apple Pay" fill="currentColor">
      <g transform="translate(1.5 2.4) scale(0.62)">
        <path d="M13.5 2.2c-.7.8-1.8 1.5-2.9 1.4-.15-1.1.4-2.27 1.03-2.99C12.36-.2 13.55-.83 14.5-.87c.12 1.15-.33 2.27-1 3.07Zm1 1.6c-1.6-.1-2.97.9-3.73.9-.77 0-1.95-.86-3.2-.83-1.65.02-3.17.96-4 2.44-1.71 2.96-.44 7.34 1.22 9.74.81 1.18 1.78 2.5 3.05 2.46 1.22-.05 1.68-.79 3.16-.79 1.47 0 1.89.79 3.18.76 1.32-.02 2.15-1.2 2.96-2.39.93-1.37 1.31-2.69 1.33-2.76-.03-.01-2.56-.98-2.58-3.9-.02-2.44 1.99-3.61 2.08-3.67-1.14-1.68-2.91-1.86-3.53-1.9Z" />
      </g>
      <text x="20" y="13.5" fontFamily={FONT} fontSize="12.5" fontWeight={600} fill="currentColor">Pay</text>
    </svg>
  )
}

export function GooglePayMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 18" className={className} role="img" aria-label="Google Pay">
      <g transform="translate(0 0.4) scale(0.95)">
        <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z" fill="#34A853" />
        <path d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z" fill="#FBBC05" />
        <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" fill="#EA4335" />
      </g>
      <text x="20" y="13.5" fontFamily={FONT} fontSize="12.5" fontWeight={600} fill="#5F6368">Pay</text>
    </svg>
  )
}

export function LinkMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 44 18" className={className} role="img" aria-label="Link by Stripe">
      <rect width="44" height="18" rx="4" fill="#00D66F" />
      <text x="22" y="13" textAnchor="middle" fontFamily={FONT} fontSize="11" fontWeight={700} fill="#011B33">link</text>
    </svg>
  )
}

/* ── Regional rails ─────────────────────────────────────────────────────── */

export function UpiMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 40 18" className={className} role="img" aria-label="UPI">
      <text x="0" y="14" fontFamily={FONT} fontSize="14" fontWeight={800} letterSpacing="0.5">
        <tspan fill="#0B8A3D">U</tspan>
        <tspan fill="#1A237E">P</tspan>
        <tspan fill="#E8730C">I</tspan>
      </text>
    </svg>
  )
}

export function PixMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 34 18" className={className} role="img" aria-label="Pix">
      <text x="17" y="14" textAnchor="middle" fontFamily={FONT} fontSize="14" fontWeight={800} fill="#32BCAD">pix</text>
    </svg>
  )
}

/* ── Providers ──────────────────────────────────────────────────────────── */

export function StripeWordmark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 60 22" className={className} role="img" aria-label="Stripe">
      <text x="0" y="17" fontFamily={FONT} fontSize="18" fontWeight={800} letterSpacing="-1" fill="#635BFF">stripe</text>
    </svg>
  )
}

export function DodoWordmark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 116 22" className={className} role="img" aria-label="Dodo Payments" fill="currentColor">
      <circle cx="6" cy="11" r="5" fill="#22C55E" />
      <circle cx="7.6" cy="9.6" r="1.4" fill="#fff" />
      <text x="15" y="17" fontFamily={FONT} fontSize="16" fontWeight={800} letterSpacing="-0.5" fill="currentColor">Dodo</text>
    </svg>
  )
}

/* ── Chip wrapper ───────────────────────────────────────────────────────── */

/** Uniform light tile that frames a brand mark so a mixed row reads tidily. */
export function BrandChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center h-6 px-1.5 rounded-md bg-white ring-1 ring-black/[0.08] shadow-sm',
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ── Resolver: method id → brand chip(s) ────────────────────────────────── */

const FALLBACK_ICON: Record<string, LucideIcon> = {
  netbanking: Landmark,
  fpx: Landmark,
  wallets: Wallet,
  ewallet: Wallet,
  mada: CreditCard,
  knet: CreditCard,
  gcash: Smartphone,
  mpesa: Smartphone,
  promptpay: QrCode,
  boleto: QrCode,
}

/** A single brand mark sized for a chip. */
function markFor(id: string): ReactNode | null {
  switch (id) {
    case 'apple_pay': return <ApplePayMark className="h-3.5 w-auto" />
    case 'google_pay': return <GooglePayMark className="h-3.5 w-auto" />
    case 'link': return <LinkMark className="h-3.5 w-auto" />
    case 'upi': return <UpiMark className="h-3 w-auto" />
    case 'pix': return <PixMark className="h-3 w-auto" />
    default: return null
  }
}

/**
 * Resolve a payment method id into one or more brand chips. The generic "card"
 * method expands into the recognizable network logos (Visa / Mastercard / Amex)
 * so users instantly see their card is accepted.
 */
export function methodChips(id: string): { key: string; node: ReactNode }[] {
  if (id === 'card') {
    return [
      { key: 'visa', node: <BrandChip><VisaMark className="h-2.5 w-auto" /></BrandChip> },
      { key: 'mc', node: <BrandChip><MastercardMark className="h-4 w-auto" /></BrandChip> },
      { key: 'amex', node: <BrandChip><AmexMark className="h-3.5 w-auto" /></BrandChip> },
    ]
  }
  const mark = markFor(id)
  if (mark) return [{ key: id, node: <BrandChip>{mark}</BrandChip> }]

  const Icon = FALLBACK_ICON[id] ?? CreditCard
  return [
    {
      key: id,
      node: (
        <BrandChip>
          <Icon className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.75} />
        </BrandChip>
      ),
    },
  ]
}

/** Build a de-duplicated, ordered row of brand chips for a set of methods. */
export function brandStrip(methods: { id: string }[]): { key: string; node: ReactNode }[] {
  const out: { key: string; node: ReactNode }[] = []
  const seen = new Set<string>()
  for (const m of methods) {
    for (const chip of methodChips(m.id)) {
      if (seen.has(chip.key)) continue
      seen.add(chip.key)
      out.push(chip)
    }
  }
  return out
}

/** The provider wordmark logo. */
export function ProviderWordmark({
  provider,
  className,
}: {
  provider: 'stripe' | 'dodopayments'
  className?: string
}) {
  return provider === 'stripe' ? (
    <StripeWordmark className={className} />
  ) : (
    <DodoWordmark className={className} />
  )
}
