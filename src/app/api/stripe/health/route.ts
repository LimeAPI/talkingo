import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { getAdminDatabases } from '@/lib/appwrite-server'
import { APPWRITE_DB_ID, COLLECTION_IDS } from '@/lib/appwrite-schema'
import { Query } from 'node-appwrite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/stripe/health
 *
 * Health check for the Stripe integration. Reports:
 *   - Stripe API connectivity
 *   - Appwrite database connectivity
 *   - Last webhook event received
 *   - Unresolved dead letter count
 *
 * Can be used by monitoring systems (UptimeRobot, Prometheus, etc.)
 * or as an internal canary endpoint.
 */
export async function GET(req: NextRequest) {
  const checks: Record<string, any> = {}
  let healthy = true

  // 1. Stripe API ping
  try {
    const balance = await stripe.balance.retrieve()
    checks.stripe_api = 'reachable'
    checks.stripe_live = balance.livemode ? 'live' : 'test'
  } catch (err: any) {
    checks.stripe_api = `error: ${err.message}`
    healthy = false
  }

  // 2. Appwrite DB connectivity
  try {
    const db = getAdminDatabases()
    // Try reading the webhook events collection (fastest read)
    const recentWebhooks = await db.listDocuments(
      APPWRITE_DB_ID,
      COLLECTION_IDS.WEBHOOK_EVENTS,
      [Query.orderDesc('processedAt'), Query.limit(1)]
    )
    checks.appwrite_db = 'reachable'
    checks.last_webhook_processed = recentWebhooks.documents.length > 0
      ? new Date((recentWebhooks.documents[0] as any).processedAt).toISOString()
      : 'never'
  } catch (err: any) {
    checks.appwrite_db = `error: ${err.message}`
    healthy = false
  }

  // 3. Dead letter queue — count unresolved events
  try {
    const db = getAdminDatabases()
    const deadLetters = await db.listDocuments(
      APPWRITE_DB_ID,
      COLLECTION_IDS.WEBHOOK_DEAD_LETTER,
      [Query.equal('resolved', false), Query.limit(1)]
    )
    // Count using a separate query to get total
    const allUnresolved = await db.listDocuments(
      APPWRITE_DB_ID,
      COLLECTION_IDS.WEBHOOK_DEAD_LETTER,
      [Query.equal('resolved', false), Query.limit(100)]
    )
    checks.dead_letter_count = allUnresolved.documents.length
    checks.dead_letter_unresolved = allUnresolved.documents.length > 0
  } catch {
    checks.dead_letter_count = 0
    checks.dead_letter_unresolved = false
  }

  return NextResponse.json({
    status: healthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  })
}
