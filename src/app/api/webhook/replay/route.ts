import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getProvider } from '@/lib/payments/registry'
import { replayDeadLetter } from '@/lib/payments/webhook-handler'
import { getDeadLetterEvent, markDeadLetterResolved } from '@/lib/appwrite-server'
import type { ProviderId } from '@/lib/payments/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhook/replay   body: { deadLetterId: string }
 *
 * Server-to-server replay of a stored dead-letter payload. The Dashboard App
 * calls this with the shared admin bearer so a failed webhook can be recovered
 * from its stored `rawBody` without asking the provider to redeliver.
 *
 * Auth: `Authorization: Bearer <APPWRITE_API_KEY>` — rejected with 401 (and NO
 * handler work performed) when missing or invalid (Req 5.5), mirroring the
 * `/api/billing/reconcile` gate.
 *
 * Algorithm (design.md → "Replay endpoint design (Main App)"):
 *   1. Validate the bearer; else 401, touch nothing (Req 5.5).
 *   2. Load the dead-letter doc by id; missing → 404.
 *   3. Derive the provider from the namespaced `eventId` prefix, falling back
 *      to the `eventType`; resolve a `PaymentProvider` via `getProvider`.
 *   4. Re-run the canonical apply path against the stored `rawBody` via
 *      `replayDeadLetter` (bypassing signature verification for this trusted,
 *      bearer-authenticated internal payload).
 *   5. On success mark the entry `resolved = true` and return { success: true }
 *      (Req 5.2); on failure leave it unresolved and return { success: false,
 *      error } (Req 5.3).
 */

/** Derive the provider id from a namespaced event id, falling back to the event type. */
function deriveProviderId(
  eventId: string | undefined,
  eventType: string | undefined,
): ProviderId | null {
  const id = typeof eventId === 'string' ? eventId : ''
  if (id.startsWith('stripe:')) return 'stripe'
  if (id.startsWith('dodopayments:')) return 'dodopayments'

  const t = (typeof eventType === 'string' ? eventType : '').toLowerCase()
  if (
    t.startsWith('customer.') ||
    t.startsWith('checkout.') ||
    t.startsWith('invoice.') ||
    t.startsWith('charge.') ||
    t.startsWith('payment_intent.')
  ) {
    return 'stripe'
  }
  if (t.startsWith('subscription.') || t.startsWith('payment.')) return 'dodopayments'
  return null
}

export async function POST(req: NextRequest) {
  // ── Admin auth — reject WITHOUT performing any handler work (Req 5.5) ──
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const adminKey = process.env.APPWRITE_API_KEY
  if (!adminKey || !token || token !== adminKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse the request body ──
  let deadLetterId: unknown
  try {
    const parsed = await req.json()
    deadLetterId = parsed?.deadLetterId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof deadLetterId !== 'string' || deadLetterId.trim() === '') {
    return NextResponse.json({ error: 'deadLetterId is required' }, { status: 400 })
  }

  // ── Load the dead-letter entry; missing → 404 ──
  let entry
  try {
    entry = await getDeadLetterEvent(deadLetterId)
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to load dead-letter entry' },
      { status: 500 },
    )
  }
  if (!entry) {
    return NextResponse.json({ error: 'Dead-letter entry not found' }, { status: 404 })
  }

  // ── Derive + resolve the provider ──
  const providerId = deriveProviderId(entry.eventId, entry.eventType)
  if (!providerId) {
    return NextResponse.json(
      {
        success: false,
        error: `Could not derive provider from eventId='${entry.eventId}' / eventType='${entry.eventType}'`,
      },
      { status: 400 },
    )
  }

  // ── Replay through the canonical apply path; mark resolved only on success ──
  try {
    const provider = getProvider(providerId)
    await replayDeadLetter(provider, entry.rawBody ?? '')
    // Apply succeeded → mark the entry resolved (Req 5.2).
    await markDeadLetterResolved(entry.$id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    // Apply failed → leave the entry unresolved, report the failure (Req 5.3).
    const message = err instanceof Error ? err.message : 'Replay failed'
    console.error(`[webhook:replay] ${entry.$id} (${providerId}) failed:`, message)
    return NextResponse.json({ success: false, error: message }, { status: 200 })
  }
}
