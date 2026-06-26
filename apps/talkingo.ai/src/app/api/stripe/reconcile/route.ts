import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import {
  getAdminDatabases,
  getAdminUsers,
  logSubscriptionEvent,
} from '@/lib/appwrite-server'
import { syncSubscriptionToAppwrite, detectPlanFromSubscription } from '@/lib/stripe/sync'
import { APPWRITE_DB_ID, COLLECTION_IDS } from '@/lib/appwrite-schema'
import { Query } from 'node-appwrite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/reconcile
 *
 * Admin-only. Compares every active Stripe subscription against Appwrite state
 * and fixes discrepancies. Designed to run as a daily cron job.
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
    // ── Fetch all Stripe subscriptions (paginated) ───────────────────
    let startingAfter: string | undefined
    const PAGE_SIZE = 100

    do {
      const listParams: any = {
        limit: PAGE_SIZE,
        status: 'all',
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }
      const stripeSubs = await stripe.subscriptions.list(listParams)

      for (const stripeSub of stripeSubs.data) {
        // Only care about active/trialing/past_due subs — everything
        // else (canceled, expired, unpaid) is a terminal state we trust.
        if (!['active', 'trialing', 'past_due'].includes(stripeSub.status)) continue

        const customerId = typeof stripeSub.customer === 'string'
          ? stripeSub.customer
          : stripeSub.customer.id

        // Find this subscription in Appwrite
        const db = getAdminDatabases()
        const existing = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
          Query.equal('stripeCustomerId', customerId),
          Query.limit(1),
        ])

        const appwriteSub = existing.documents.length > 0
          ? existing.documents[0] as any
          : null

        if (!appwriteSub) {
          // ── Orphan: paid in Stripe, missing from Appwrite ──────────
          // Try to find user by email
          try {
            const customer = await stripe.customers.retrieve(customerId)
            if (customer.deleted || !customer.email) {
              results.push(`⚠️ Customer ${customerId}: Stripe sub ${stripeSub.id} active but no email to resolve`)
              continue
            }
            const users = getAdminUsers()
            const appwriteUsers = await users.list([Query.equal('email', customer.email)])
            if (appwriteUsers.users.length === 0) {
              results.push(`⚠️ Customer ${customerId}: email ${customer.email} not found in Appwrite`)
              continue
            }
            const userId = appwriteUsers.users[0].$id
            await syncSubscriptionToAppwrite({ userId, customerId, subscription: stripeSub })
            results.push(`✅ Customer ${customerId}: recovered orphan subscription for user ${userId}`)
          } catch (err: any) {
            errors++
            results.push(`❌ Customer ${customerId}: error recovering orphan — ${err.message}`)
          }
        } else if (appwriteSub.status !== stripeSub.status) {
          // ── Status mismatch ────────────────────────────────────────
          try {
            await syncSubscriptionToAppwrite({
              userId: appwriteSub.userId,
              customerId,
              subscription: stripeSub,
            })
            results.push(`✅ User ${appwriteSub.userId}: status ${appwriteSub.status} → ${stripeSub.status}`)
            logSubscriptionEvent({
              userId: appwriteSub.userId,
              eventType: 'reconciliation_fix',
              stripeEventId: `reconcile_${stripeSub.id}`,
              subscriptionId: stripeSub.id,
              customerId,
              previousStatus: appwriteSub.status,
              newStatus: stripeSub.status,
              plan: detectPlanFromSubscription(stripeSub),
              timestamp: Date.now(),
            }).catch(() => {})
          } catch (err: any) {
            errors++
            results.push(`❌ User ${appwriteSub.userId}: error fixing mismatch — ${err.message}`)
          }
        }
      }

      startingAfter = stripeSubs.has_more
        ? stripeSubs.data[stripeSubs.data.length - 1].id
        : undefined
    } while (startingAfter)

    return NextResponse.json({
      reconciled: results.filter((r) => r.startsWith('✅')).length,
      errors,
      results,
    })
  } catch (err: any) {
    console.error('[stripe/reconcile] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
