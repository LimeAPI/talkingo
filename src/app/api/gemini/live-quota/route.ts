import { NextRequest, NextResponse } from 'next/server'
import { getSubscription, getLiveUsageSeconds } from '@/lib/appwrite-server'
import {
  resolveLiveDailyCapSeconds,
  resolveTier,
  isLiveCapEnforced,
  liveDayKey,
  remainingLiveSeconds,
} from '@/lib/subscription/live-limits'

/**
 * GET /api/gemini/live-quota?localDate=YYYY-MM-DD
 *
 * Lightweight pre-check so the UI can show remaining live-voice minutes and
 * soft-disable the "start call" button BEFORE opening the WebSocket — instead
 * of the user learning they're capped only after a connection is rejected.
 *
 * The WebSocket proxy remains the source of truth and enforces independently;
 * this endpoint is advisory. `enforced` tells the client whether the cap is
 * currently active (vs shadow mode) so it can decide how loud to be.
 */
export async function GET(req: NextRequest) {
  const { verifyAuth } = await import('@/lib/api/auth-guard')
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { userId } = auth

  const localDate = req.nextUrl.searchParams.get('localDate')
  const dayKey = liveDayKey(localDate)

  // getSubscription can throw on a real DB error; getLiveUsageSeconds fails open.
  // Advisory endpoint → degrade gracefully to "full quota" rather than erroring.
  let capSeconds = 0
  let tier = 'none'
  let used = 0
  try {
    const sub = await getSubscription(userId)
    tier = resolveTier(sub)
    capSeconds = resolveLiveDailyCapSeconds(sub)
    used = await getLiveUsageSeconds(userId, dayKey)
  } catch {
    // Leave defaults; the WS proxy will make the real decision.
  }

  const remaining = remainingLiveSeconds(used, capSeconds)

  return NextResponse.json({
    tier,
    enforced: isLiveCapEnforced(),
    capSeconds,
    usedSeconds: Math.round(used),
    remainingSeconds: Math.round(remaining),
    // Convenience for UI copy.
    capMinutes: Math.round(capSeconds / 60),
    remainingMinutes: Math.floor(remaining / 60),
    // Only meaningful when enforced; in shadow mode the UI should not block.
    reached: capSeconds > 0 && remaining <= 0,
    dayKey,
  })
}
