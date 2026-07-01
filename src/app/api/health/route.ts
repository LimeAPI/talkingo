import { NextResponse } from 'next/server'
import { getAdminDatabases } from '@/lib/appwrite-server'
import { APPWRITE_DB_ID, COLLECTION_IDS } from '@/lib/appwrite-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Health endpoint for uptime monitoring / keep-alive pings.
 *
 * Keeps both Render AND Appwrite alive:
 *   - Render free tier spins down after ~15 min of inactivity
 *   - Appwrite Cloud free tier pauses projects after 1 week of inactivity
 *
 * Use a free cron service (UptimeRobot, cron-job.org, etc.) to ping
 * this endpoint every 5-10 minutes to prevent cold starts.
 */
export async function GET() {
  const checks: Record<string, string> = {}

  // Ping Appwrite to keep project active
  try {
    const db = getAdminDatabases()
    await db.listDocuments(
      APPWRITE_DB_ID,
      COLLECTION_IDS.USER_PREFERENCES,
      []
    )
    checks.appwrite = 'ok'
  } catch {
    checks.appwrite = 'pinged (response keeps project alive)'
  }

  return NextResponse.json({
    status: 'ok',
    checks,
    uptime: process.uptime(),
    timestamp: Date.now(),
  })
}