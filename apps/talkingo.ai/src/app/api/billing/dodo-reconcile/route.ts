import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { dodo } from '@/lib/dodopayments/client'
import { getAdminDatabases } from '@/lib/appwrite-server'
import { APPWRITE_DB_ID, COLLECTION_IDS } from '@/lib/appwrite-schema'
import { Query } from 'node-appwrite'
import { syncDodoSubscriptionToAppwrite, type DodoSubscriptionInfo, type DodoStatus } from '@/lib/dodopayments/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/dodo-reconcile
 *
 * Admin-only. Compares every DodoPayments subscription against Appwrite state
 * and fixes discrepancies. Designed to run as a daily cron job, alongside the
 * Stripe reconciliation endpoint.
 *
 * Auth: Bearer token must match APPWRITE_API_KEY.
 *
 * Response: { reconciled: number, errors: number, results: string[] }
 */
export async function POST(req: NextRequest) {
  // ── Admin auth ─────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token || token !== process.env.APPWRITE_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []
  let errors = 0

  try {
    const db = getAdminDatabases()

    // Pull all Appwrite subs that have a DodoPayments customerId
    const appwriteSubs = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
      Query.isNotNull('dodopaymentsCustomerId'),
      Query.limit(500),
    ])

    for (const appwriteSubRaw of appwriteSubs.documents) {
      const appwriteSub = appwriteSubRaw as any
      const customerId = appwriteSub.dodopaymentsCustomerId as string | undefined
      const subId = appwriteSub.dodopaymentsSubscriptionId as string | undefined
      if (!customerId || !subId) {
        results.push(`⚠️ User ${appwriteSub.userId}: dodopaymentsCustomerId/subId missing`)
        continue
      }

      try {
        const live: any = await dodo.subscriptions.retrieve(subId)

        const rawStatus = (live?.status ?? '').toString().toLowerCase()
        const status: DodoStatus = normalizeStatus(rawStatus)
        const plan: 'monthly' | 'yearly' =
          (live?.plan === 'year' || live?.plan === 'yearly' ||
            live?.price?.interval === 'year') ? 'yearly' : 'monthly'
        const periodEndSec = live?.next_billing_date ?? live?.current_period_end ?? null
        const cancelAtPeriodEnd =
          (live?.cancel_at_next_billing_date as boolean | undefined) ??
          (live?.cancel_at_period_end as boolean | undefined) ??
          false

        const liveInfo: DodoSubscriptionInfo = {
          id: String(live?.subscription_id ?? live?.id ?? subId),
          customerId,
          status,
          plan,
          trialEnd: live?.trial_end ? Number(live.trial_end) * 1000 : undefined,
          periodEnd: periodEndSec ? Number(periodEndSec) * 1000 : undefined,
          cancelAtPeriodEnd,
        }

        const drifted =
          appwriteSub.status !== liveInfo.status ||
          appwriteSub.plan !== liveInfo.plan ||
          (liveInfo.periodEnd && appwriteSub.periodEnd !== liveInfo.periodEnd) ||
          appwriteSub.cancelAtPeriodEnd !== liveInfo.cancelAtPeriodEnd

        if (drifted) {
          await syncDodoSubscriptionToAppwrite({
            userId: appwriteSub.userId,
            customerId,
            subscription: liveInfo,
          })
          results.push(
            `✅ User ${appwriteSub.userId}: ` +
              `${appwriteSub.status}→${liveInfo.status}, ${appwriteSub.plan}→${liveInfo.plan}`,
          )
        }
      } catch (err: any) {
        // If the subscription was deleted in Dodo, mark expired locally
        if (err?.status === 404 || err?.code === 'resource_missing') {
          await db.updateDocument(
            APPWRITE_DB_ID,
            COLLECTION_IDS.SUBSCRIPTIONS,
            appwriteSub.$id,
            {
              status: 'expired',
              cancelAtPeriodEnd: false,
              updatedAt: Date.now(),
            },
          )
          results.push(`✅ User ${appwriteSub.userId}: Dodo sub missing → marked expired`)
        } else {
          errors++
          results.push(`❌ User ${appwriteSub.userId}: ${err?.message || 'unknown error'}`)
        }
      }
    }

    return NextResponse.json({
      reconciled: results.filter((r) => r.startsWith('✅')).length,
      errors,
      total: appwriteSubs.documents.length,
      results,
    })
  } catch (err: any) {
    console.error('[billing/dodo-reconcile] Error:', err?.message)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

function normalizeStatus(raw: string): DodoStatus {
  const s = (raw || '').toLowerCase().trim()
  if (s === 'active' || s === 'succeeded' || s === 'paid' || s === 'renewed') return 'active'
  if (s === 'trialing' || s === 'trial' || s === 'in_trial') return 'trialing'
  if (s === 'past_due' || s === 'past-due' || s === 'payment_failed' || s === 'failed') return 'past_due'
  if (s === 'canceled' || s === 'cancelled') return 'canceled'
  if (s === 'expired' || s === 'terminated') return 'expired'
  if (s === 'incomplete_expired' || s === 'incomplete-expired') return 'incomplete_expired'
  if (s === 'unpaid') return 'unpaid'
  return 'incomplete'
}
