/**
 * Shared guards for mutating billing routes.
 *
 * Every authenticated, state-changing `/api/billing/*` route runs these two
 * guards before touching the request body:
 *
 *   1. `validateOrigin` / `originGuard` — allowlist-based Origin/Referer check
 *      that rejects cross-site (CSRF) requests with a 403. Webhook routes are
 *      exempt (they are authenticated by signature, not origin — see Req 15.5).
 *   2. `checkRateLimit` / `rateLimitGuard` — a per-user sliding-window limiter
 *      (default 10 requests / 60s) that rejects bursts with a 429 carrying an
 *      integer `Retry-After` header between 1 and 60 seconds.
 *
 * The predicate forms (`validateOrigin`, `checkRateLimit`) are pure and easy to
 * unit-test; the response forms (`originGuard`, `rateLimitGuard`) return a ready
 * `NextResponse` on rejection and `null` on pass, so route code reads as:
 *
 *   const originErr = originGuard(req); if (originErr) return originErr
 *   const auth = await verifyAuth(req); if (!auth) return unauthorized()
 *   const rlErr = rateLimitGuard(`billing:checkout:${auth.userId}`)
 *   if (rlErr) return rlErr
 *
 * _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
 */

import { NextRequest, NextResponse } from 'next/server'

// ─── Origin validation (lightweight CSRF protection) ────────────────────────

/**
 * Build the allowlist of trusted origins. Read lazily (not module-cached) so
 * tests and runtime config changes to `NEXT_PUBLIC_APP_URL` are respected.
 */
function allowedOrigins(): string[] {
  return [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'https://localhost:3000',
  ].filter((o): o is string => Boolean(o))
}

/**
 * Validate that the request's `Origin` (or `Referer`) header matches the
 * configured allowlist of trusted origins.
 *
 * Returns `false` when the origin is missing or not on the allowlist — the
 * caller (see {@link originGuard}) turns that into a 403.
 *
 * _Requirements: 15.1, 15.2_
 */
export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin') || req.headers.get('referer') || ''

  // 15.2: a missing origin is treated as a failed check.
  if (!origin) return false

  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    // Malformed Origin/Referer header.
    return false
  }

  const hostname = originUrl.hostname

  // Always allow localhost during development.
  if (process.env.NODE_ENV !== 'production') {
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  }

  for (const allowed of allowedOrigins()) {
    let allowedUrl: URL
    try {
      allowedUrl = new URL(allowed)
    } catch {
      continue
    }
    if (
      originUrl.protocol === allowedUrl.protocol &&
      originUrl.hostname === allowedUrl.hostname &&
      originUrl.port === allowedUrl.port
    ) {
      return true
    }
  }

  return false
}

/**
 * Origin guard for mutating billing routes.
 *
 * Returns a 403 `NextResponse` when the request origin is absent or not on the
 * allowlist, otherwise `null` (request may proceed). Webhook routes MUST NOT
 * call this — they are exempt from origin validation (Req 15.5).
 *
 * _Requirements: 15.1, 15.2, 15.5_
 */
export function originGuard(req: NextRequest): NextResponse | null {
  if (validateOrigin(req)) return null
  return NextResponse.json(
    { error: 'forbidden_origin', message: 'Request origin is not allowed.' },
    { status: 403 }
  )
}

// ─── Per-user sliding-window rate limiting ──────────────────────────────────

/** Default per-user request budget within {@link DEFAULT_WINDOW_MS}. */
export const DEFAULT_RATE_LIMIT = 10
/** Default sliding window length in milliseconds. */
export const DEFAULT_WINDOW_MS = 60_000

export interface RateLimitResult {
  /** Whether the current request is allowed under the window budget. */
  allowed: boolean
  /** Remaining requests permitted in the current window (0 when blocked). */
  remaining: number
  /**
   * Integer seconds until the window frees up enough capacity for one more
   * request. Always an integer in `[1, 60]`. Only meaningful when
   * `allowed === false`.
   */
  retryAfter: number
}

/**
 * Per-key request timestamp log. Each entry is the list of request times
 * (epoch ms) observed within the most recent window for that key. This is a
 * true sliding window (not a fixed window that resets on a boundary).
 *
 * Note: in-memory and per-instance only. In a multi-instance/serverless
 * deployment this is a best-effort burst guard; a shared store (e.g. Redis)
 * would be needed for strict global limits.
 */
const requestLog = new Map<string, number[]>()

function clampRetryAfter(ms: number): number {
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 1) return 1
  if (seconds > 60) return 60
  return seconds
}

/**
 * Sliding-window rate limit keyed by an arbitrary identifier (typically the
 * authenticated user id, optionally namespaced per route, e.g.
 * `billing:checkout:<userId>`).
 *
 * Counts only the requests whose timestamps fall within the trailing
 * `windowMs`. When the count reaches `limit`, the request is rejected and
 * `retryAfter` reports the integer seconds (clamped to `[1, 60]`) until the
 * oldest in-window request ages out.
 *
 * _Requirements: 15.3, 15.4_
 */
export function checkRateLimit(
  key: string,
  limit: number = DEFAULT_RATE_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS
): RateLimitResult {
  const now = Date.now()
  const windowStart = now - windowMs

  // Keep only timestamps still inside the trailing window.
  const previous = requestLog.get(key) ?? []
  const recent = previous.filter((ts) => ts > windowStart)

  if (recent.length >= limit) {
    // Blocked: the window is full. The earliest in-window request determines
    // when capacity frees up.
    const oldest = recent[0]
    const retryAfter = clampRetryAfter(oldest + windowMs - now)
    requestLog.set(key, recent)
    pruneIfNeeded(now)
    return { allowed: false, remaining: 0, retryAfter }
  }

  recent.push(now)
  requestLog.set(key, recent)
  pruneIfNeeded(now)
  return { allowed: true, remaining: limit - recent.length, retryAfter: 0 }
}

/**
 * Rate-limit guard for mutating billing routes.
 *
 * Returns a 429 `NextResponse` (with an integer `Retry-After` header between 1
 * and 60) when the per-user sliding-window budget is exceeded, otherwise
 * `null` (request may proceed).
 *
 * _Requirements: 15.3, 15.4_
 */
export function rateLimitGuard(
  key: string,
  limit: number = DEFAULT_RATE_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS
): NextResponse | null {
  const result = checkRateLimit(key, limit, windowMs)
  if (result.allowed) return null
  return NextResponse.json(
    { error: 'rate_limited', message: 'Too many requests. Please wait before retrying.' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
  )
}

/**
 * Drop keys whose timestamps have all aged out, to bound memory growth. Only
 * scans once the map gets reasonably large to keep the hot path cheap.
 */
function pruneIfNeeded(now: number): void {
  if (requestLog.size < 256) return
  for (const [key, timestamps] of requestLog) {
    // The widest window we use is DEFAULT_WINDOW_MS; treat anything older as dead.
    const last = timestamps[timestamps.length - 1]
    if (last === undefined || now - last > DEFAULT_WINDOW_MS) {
      requestLog.delete(key)
    }
  }
}

/**
 * Test-only helper to clear all recorded request history so each test starts
 * from a clean window.
 */
export function __resetRateLimitStore(): void {
  requestLog.clear()
}
