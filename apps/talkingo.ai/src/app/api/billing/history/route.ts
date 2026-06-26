import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/api/auth-guard'
import { getSubscription } from '@/lib/appwrite-server'
import { toUnified } from '@/lib/payments/subscription-mapper'
import type { UnifiedInvoice } from '@/lib/payments/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/history — provider-agnostic billing history.
 *
 * Returns the authenticated subscriber's invoices/payments as a single
 * provider-agnostic list, ordered by date descending, regardless of which
 * provider powers the subscription. The route resolves the provider + customer
 * id from the user's STORED subscription (canonical `provider` field, legacy
 * fallback via `toUnified`) and fetches the invoice list from that provider via
 * a standalone helper, keeping the Stripe/Dodo SDKs out of the route.
 *
 * Status contract:
 *   - 401 `unauthorized`        → no valid authenticated session
 *   - 200 { invoices: [] }      → no stored subscription / no billing history (12.2)
 *   - 200 { invoices: [...] }   → unified invoices ordered by date desc (12.1)
 *   - 502 `provider_unreachable`→ provider could not be reached; stored data is
 *                                 left unchanged (12.3)
 *
 * This route is read-only: it never writes to Appwrite, so a provider failure
 * cannot alter stored billing or subscription data (Req 12.3).
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
export async function GET(req: NextRequest) {
  // ── 1. Authentication — 401 when unauthenticated ──────────────────────────
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401 },
    )
  }
  const { userId, jwt } = auth

  // ── 2. Resolve provider + customer id from the STORED subscription ─────────
  // No stored subscription (or no resolvable provider/customer) means there is
  // no billing history to fetch → return an empty list rather than an error.
  const doc = await getSubscription(userId, jwt)
  const stored = doc ? toUnified(doc) : null
  if (!stored || !stored.providerCustomerId) {
    return NextResponse.json({ invoices: [] })
  }

  // ── 3. Fetch the provider's invoice list via a standalone helper ──────────
  // SDK calls live in the helper, never in the route. Any provider/network
  // failure throws and is turned into a 502 below — nothing is persisted, so
  // stored billing/subscription data is left unchanged (12.3).
  let invoices: UnifiedInvoice[]
  try {
    if (stored.provider === 'stripe') {
      const { listStripeInvoices } = await import('@/lib/stripe/invoices')
      invoices = await listStripeInvoices(stored.providerCustomerId)
    } else {
      const { listDodoInvoices } = await import('@/lib/dodopayments/invoices')
      invoices = await listDodoInvoices(stored.providerCustomerId)
    }
  } catch (err) {
    console.error(
      '[billing/history] provider unreachable:',
      err instanceof Error ? err.message : err,
    )
    return NextResponse.json(
      {
        error: 'provider_unreachable',
        message: 'Billing history could not be retrieved from the payment provider.',
      },
      { status: 502 },
    )
  }

  // ── 4. Order by date descending (12.1) and return ────────────────────────
  invoices.sort((a, b) => b.date - a.date)

  return NextResponse.json({
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      date: new Date(invoice.date).toISOString(),
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status,
      provider: invoice.provider,
      ...(invoice.receiptUrl ? { receiptUrl: invoice.receiptUrl } : {}),
    })),
  })
}
