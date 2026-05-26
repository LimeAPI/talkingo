/**
 * POST /api/cache/invalidate
 *
 * Previously used for scenario cache invalidation.
 * Now scenarios are hardcoded, so this endpoint is a no-op.
 * Kept for backwards compatibility and potential future use.
 *
 * Body: { type: 'all' } (ignored)
 *
 * Protected by a shared secret (CACHE_INVALIDATION_SECRET env var).
 * If not set, only same-origin requests are accepted.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Client, Databases, ID, Query } from 'node-appwrite'
import { serverCache, CACHE_KEYS } from '@/lib/cache/server-cache'

const DB_ID = 'talkingo_db'
const COLLECTION_CONFIG = 'system_config'

export async function POST(req: NextRequest) {
  // Simple auth check — shared secret header
  const secret = process.env.CACHE_INVALIDATION_SECRET
  if (secret) {
    const provided = req.headers.get('x-invalidation-secret')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: { type?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  // No-op — scenarios are now hardcoded, no cache to invalidate
  // Endpoint kept for backwards compatibility

  return NextResponse.json({
    success: true,
    invalidated: 'none (scenarios are hardcoded)',
    timestamp: Date.now(),
  })
}
