/**
 * Live-voice daily usage limits — the single source of truth for "how many
 * minutes of live voice does this user get per day, and is that cap enforced."
 *
 * WHY a cap at all: live voice (`gemini-3.1-flash-live-preview`) is the only
 * *unbounded* cost in the app — it streams audio both ways continuously, at
 * roughly 7–10× the per-minute cost of any turn-based mode (see
 * `docs/ai_cost_rates.md`). Text stays truly unlimited; this cap is a fair-use
 * ceiling on the one line item that can run underwater, and a guard against
 * cheaper future plans / trial abuse.
 *
 * DESIGN NOTES
 *  - Caps are resolved PER PLAN, not hardcoded, so new plans slot in by adding
 *    a row to `LIVE_DAILY_CAP_SECONDS` — nothing else changes.
 *  - This module is intentionally free of `server-only`, Next, and node-appwrite
 *    imports so it can be shared by the tsx live proxy (`server/live-proxy.ts`),
 *    Next API routes, and the client. Keep it a pure functions + constants file.
 *  - Enforcement is behind a flag (`isLiveCapEnforced`). We ship metering FIRST
 *    in shadow mode (measure real usage), then flip the flag once the data
 *    confirms the number. Lowering a cap later is a takeaway; measuring first
 *    lets us start correct.
 */

/** Subscription shape we need to resolve a cap. Kept minimal + structural so
 *  both `SubscriptionDoc` (server) and the client's stored subscription satisfy
 *  it without a hard type dependency. */
export interface CapSubscriptionInfo {
  /** 'trialing' | 'active' | 'past_due' | 'canceled' | ... */
  status?: string | null
  /** 'trial' | 'monthly' | 'yearly' | <future plan id> */
  plan?: string | null
}

/**
 * Daily live-voice ceiling in SECONDS, keyed by a resolved "tier" (see
 * `resolveTier`). Add future plans here — this is the only place the numbers
 * live.
 *
 * Rationale for the starting values:
 *  - `standard` (active monthly/yearly): 20 min/day. Generous for genuine daily
 *    speaking practice; ~$0.24/day worst-case cost vs a $30/mo plan = safe.
 *  - `trial`: 10 min/day. A trial user is pure cost with no revenue yet, so the
 *    most expensive feature gets a tighter leash during the trial.
 *  - `none`: 0. Live voice is premium-gated elsewhere; this is a backstop.
 */
export const LIVE_DAILY_CAP_SECONDS: Record<LiveCapTier, number> = {
  none: 0,
  trial: 10 * 60,
  standard: 20 * 60,
}

export type LiveCapTier = 'none' | 'trial' | 'standard'

/**
 * How long before the hard cap to begin the graceful wind-down (a warm,
 * in-character "let's wrap up" nudge). The hard cap disconnect is INDEPENDENT of
 * whether the tutor actually wraps up — this is decoration, not enforcement.
 */
export const LIVE_WINDDOWN_SECONDS = 120 // start wrapping up 2 min before the cap

/**
 * Idle auto-disconnect: if no audio flows (either direction) for this long, end
 * the session. Keeps an abandoned-but-open call from silently burning the
 * user's daily minutes (fair to the user) — and matches the fact that idle time
 * costs us ~nothing (no audio streamed). Also bounds the wall-clock metering.
 */
export const LIVE_IDLE_TIMEOUT_SECONDS = 60

/** Map a subscription to its cap tier. Extend as plans are added. */
export function resolveTier(sub: CapSubscriptionInfo | null | undefined): LiveCapTier {
  if (!sub) return 'none'
  const status = (sub.status ?? '').toLowerCase()
  // Only entitled statuses reach live voice at all; mirror the proxy gate.
  if (status === 'trialing') return 'trial'
  if (status === 'active') return 'standard'
  return 'none'
}

/** Resolve a user's daily live-voice cap (seconds) from their subscription.
 *
 * TEST OVERRIDE: set `LIVE_CAP_TEST_MINUTES` (e.g. `1`) to force a tiny cap for
 * ALL entitled users, so you can see the wind-down + "done for today" screen in
 * about a minute instead of 20. Remove the env var to return to normal caps.
 */
export function resolveLiveDailyCapSeconds(sub: CapSubscriptionInfo | null | undefined): number {
  const tier = resolveTier(sub)
  if (tier === 'none') return 0 // never entitled → no override

  const testMinutes = Number(process.env.LIVE_CAP_TEST_MINUTES)
  if (Number.isFinite(testMinutes) && testMinutes > 0) {
    return Math.round(testMinutes * 60)
  }
  return LIVE_DAILY_CAP_SECONDS[tier]
}

/**
 * Whether the cap is actively ENFORCED (connect gate + mid-session disconnect),
 * versus shadow mode (meter + log only). Defaults to shadow mode so the cap can
 * be rolled out safely: metering ships first, enforcement flips on via env once
 * real usage data confirms the number.
 *
 * Set `LIVE_CAP_ENFORCE=true` to enforce.
 */
export function isLiveCapEnforced(): boolean {
  return (process.env.LIVE_CAP_ENFORCE ?? '').toLowerCase() === 'true'
}

/**
 * The day-bucket key for a live session, in the USER's local day so "daily"
 * resets at their local midnight rather than UTC. The client supplies its local
 * date (`YYYY-MM-DD`) at setup; we validate the shape and fall back to UTC today
 * on anything malformed.
 *
 * Gaming note: a client could send a fake date to shift its window, but that
 * only MOVES the 24h bucket — it can't remove the cap or grant more than one
 * cap's worth within a real day-plus-window. Acceptable for a fair-use ceiling.
 * For an airtight version, store the user's timezone server-side and derive it
 * here instead of trusting the client value.
 */
export function liveDayKey(clientLocalDate?: string | null): string {
  if (clientLocalDate && /^\d{4}-\d{2}-\d{2}$/.test(clientLocalDate)) {
    return clientLocalDate
  }
  return new Date().toISOString().split('T')[0]
}

/** Remaining live-voice seconds today given prior usage + resolved cap. */
export function remainingLiveSeconds(usedSeconds: number, capSeconds: number): number {
  return Math.max(0, capSeconds - Math.max(0, usedSeconds))
}
