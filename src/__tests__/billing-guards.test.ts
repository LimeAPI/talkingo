/**
 * Unit tests — Mutating billing route guards (origin + sliding-window rate limit)
 *
 * Feature: unified-payment-experience, Task 8.1
 * _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
 *
 * Covers:
 *  - validateOrigin / originGuard: 403 on missing/disallowed origin, pass on allowlisted
 *  - checkRateLimit: per-user sliding-window of 10/60s with integer Retry-After 1..60
 *  - rateLimitGuard: 429 + Retry-After header on overflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  validateOrigin,
  originGuard,
  checkRateLimit,
  rateLimitGuard,
  DEFAULT_RATE_LIMIT,
  DEFAULT_WINDOW_MS,
  __resetRateLimitStore,
} from '@/lib/payments/guards'

// ─── Helpers ────────────────────────────────────────────────────────────────

const APP_URL = 'https://app.talkingo.ai'

function makeReq(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://app.talkingo.ai/api/billing/checkout', {
    method: 'POST',
    headers,
  })
}

beforeEach(() => {
  __resetRateLimitStore()
  ;(process.env as Record<string, string>).NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_APP_URL = APP_URL
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Origin validation (15.1, 15.2, 15.5) ────────────────────────────────────

describe('validateOrigin', () => {
  it('accepts a request whose Origin is on the allowlist', () => {
    expect(validateOrigin(makeReq({ origin: APP_URL }))).toBe(true)
  })

  it('accepts a request whose Referer is on the allowlist when Origin is absent', () => {
    expect(validateOrigin(makeReq({ referer: `${APP_URL}/pricing` }))).toBe(true)
  })

  it('rejects a request with no Origin or Referer header (15.2)', () => {
    expect(validateOrigin(makeReq({}))).toBe(false)
  })

  it('rejects a request whose Origin is not on the allowlist', () => {
    expect(validateOrigin(makeReq({ origin: 'https://evil.example.com' }))).toBe(false)
  })

  it('rejects a malformed Origin header', () => {
    expect(validateOrigin(makeReq({ origin: 'not-a-url' }))).toBe(false)
  })

  it('rejects an allowlisted host on a different port', () => {
    expect(validateOrigin(makeReq({ origin: 'https://app.talkingo.ai:8443' }))).toBe(false)
  })

  it('allows localhost outside production', () => {
    ;(process.env as Record<string, string>).NODE_ENV = 'development'
    expect(validateOrigin(makeReq({ origin: 'http://localhost:5173' }))).toBe(true)
  })
})

describe('originGuard', () => {
  it('returns null (pass) when origin is valid', () => {
    expect(originGuard(makeReq({ origin: APP_URL }))).toBeNull()
  })

  it('returns a 403 response when origin is missing (15.2)', () => {
    const res = originGuard(makeReq({}))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })

  it('returns a 403 response when origin is disallowed', () => {
    const res = originGuard(makeReq({ origin: 'https://evil.example.com' }))
    expect(res!.status).toBe(403)
  })
})

// ─── Sliding-window rate limit (15.3, 15.4) ───────────────────────────────────

describe('checkRateLimit', () => {
  it('defaults to 10 requests per 60s window', () => {
    expect(DEFAULT_RATE_LIMIT).toBe(10)
    expect(DEFAULT_WINDOW_MS).toBe(60_000)
  })

  it('allows up to the limit then blocks the (limit+1)th request (15.3)', () => {
    const key = 'user-A'
    for (let i = 0; i < DEFAULT_RATE_LIMIT; i++) {
      const r = checkRateLimit(key)
      expect(r.allowed).toBe(true)
      expect(r.remaining).toBe(DEFAULT_RATE_LIMIT - 1 - i)
    }
    const blocked = checkRateLimit(key)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('tracks limits independently per user key', () => {
    for (let i = 0; i < DEFAULT_RATE_LIMIT; i++) checkRateLimit('user-A')
    // user-A is now exhausted, user-B is untouched.
    expect(checkRateLimit('user-A').allowed).toBe(false)
    expect(checkRateLimit('user-B').allowed).toBe(true)
  })

  it('returns an integer Retry-After between 1 and 60 when blocked (15.4)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'user-C'
    for (let i = 0; i < DEFAULT_RATE_LIMIT; i++) checkRateLimit(key)

    // Immediately after filling the window, ~60s remain until the oldest ages out.
    const blocked = checkRateLimit(key)
    expect(blocked.allowed).toBe(false)
    expect(Number.isInteger(blocked.retryAfter)).toBe(true)
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
    expect(blocked.retryAfter).toBe(60)
  })

  it('shrinks Retry-After as the window slides forward', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'user-D'
    for (let i = 0; i < DEFAULT_RATE_LIMIT; i++) checkRateLimit(key)

    // Advance 45s: ~15s remain until the oldest request ages out.
    vi.advanceTimersByTime(45_000)
    const blocked = checkRateLimit(key)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBe(15)
  })

  it('admits a new request once the oldest one slides out of the window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'user-E'
    for (let i = 0; i < DEFAULT_RATE_LIMIT; i++) checkRateLimit(key)
    expect(checkRateLimit(key).allowed).toBe(false)

    // Move just past the full window so all prior requests expire.
    vi.advanceTimersByTime(DEFAULT_WINDOW_MS + 1)
    expect(checkRateLimit(key).allowed).toBe(true)
  })

  it('clamps Retry-After to 60 even for larger configured windows', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'user-F'
    const bigWindow = 120_000
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, bigWindow)
    const blocked = checkRateLimit(key, 3, bigWindow)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBe(60)
  })
})

describe('rateLimitGuard', () => {
  it('returns null (pass) while under the limit', () => {
    expect(rateLimitGuard('user-G')).toBeNull()
  })

  it('returns a 429 with an integer Retry-After header when over the limit (15.4)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'user-H'
    for (let i = 0; i < DEFAULT_RATE_LIMIT; i++) {
      expect(rateLimitGuard(key)).toBeNull()
    }
    const res = rateLimitGuard(key)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    const retryAfter = res!.headers.get('Retry-After')
    expect(retryAfter).toBeTruthy()
    const value = Number(retryAfter)
    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(60)
  })
})
