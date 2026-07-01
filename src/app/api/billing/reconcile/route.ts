import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { enabledProviders, getProvider } from '@/lib/payments/registry'
import type { PaymentProvider, ProviderId } from '@/lib/payments/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/reconcile?provider=all|stripe|dodopayments
 *
 * Provider-agnostic, admin-only reconciliation entry point. Replaces the two
 * provider-specific endpoints (`/api/stripe/reconcile`,
 * `/api/billing/dodo-reconcile`) with a single route that delegates to each
 * resolved `PaymentProvider.reconcile()`.
 *
 * Auth: `Authorization: Bearer <APPWRITE_API_KEY>` — rejected with 401 (and no
 * reconciliation performed) when missing or invalid (Req 9.1).
 *
 * `provider=all` (default) runs reconciliation sequentially over every enabled
 * provider, continuing past per-provider failures and counting them as errors
 * (Req 9.2/9.3). A single provider id runs only that provider.
 *
 * The per-provider `reconcile()` already fixes drift (Req 9.4), creates orphans
 * (Req 9.5) and expires missing subscriptions (Req 9.6). This route aggregates
 * their reports into totals plus a combined per-subscription result list tagged
 * with the originating provider (Req 9.7).
 *
 * Response:
 * {
 *   provider: 'all' | ProviderId,
 *   reconciled: number,            // total across providers
 *   errors: number,                // total across providers
 *   providers: Array<{ provider, reconciled, errors, ok }>,
 *   results: Array<{ provider, detail, error }>,
 * }
 */
export async function POST(req: NextRequest) {
  // ── Admin auth — reject WITHOUT performing any reconciliation (Req 9.1) ──
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const adminKey = process.env.APPWRITE_API_KEY
  if (!adminKey || !token || token !== adminKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Resolve the requested scope ─────────────────────────────────────
  const requested = (req.nextUrl.searchParams.get('provider') || 'all').toLowerCase()

  let providers: PaymentProvider[]
  if (requested === 'all') {
    providers = enabledProviders()
  } else {
    try {
      providers = [getProvider(requested as ProviderId)]
    } catch (err: any) {
      // Unknown / disabled / invalid provider id — no reconciliation performed.
      return NextResponse.json(
        { error: err?.message || 'Invalid provider', provider: requested },
        { status: 400 },
      )
    }
  }

  // ── Reconcile each provider sequentially, aggregating outcomes ──────
  let totalReconciled = 0
  let totalErrors = 0
  const results: Array<{ provider: ProviderId; detail: string; error: boolean }> = []
  const perProvider: Array<{
    provider: ProviderId
    reconciled: number
    errors: number
    ok: boolean
  }> = []

  for (const provider of providers) {
    try {
      const report = await provider.reconcile()
      totalReconciled += report.reconciled
      totalErrors += report.errors
      for (const detail of report.results) {
        results.push({ provider: provider.id, detail, error: detail.startsWith('❌') })
      }
      perProvider.push({
        provider: provider.id,
        reconciled: report.reconciled,
        errors: report.errors,
        ok: true,
      })
    } catch (err: any) {
      // One provider failing must NOT stop the others (Req 9.3): record the
      // failure as an error entry, bump the error count, and continue.
      const message = err?.message || 'unknown error'
      totalErrors += 1
      results.push({
        provider: provider.id,
        detail: `❌ ${provider.id}: reconcile failed — ${message}`,
        error: true,
      })
      perProvider.push({ provider: provider.id, reconciled: 0, errors: 1, ok: false })
      console.error(`[billing/reconcile] ${provider.id} failed:`, message)
    }
  }

  return NextResponse.json({
    provider: requested === 'all' ? 'all' : (requested as ProviderId),
    reconciled: totalReconciled,
    errors: totalErrors,
    providers: perProvider,
    results,
  })
}
