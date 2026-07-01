/**
 * Unit Tests — Live-voice daily cap logic (`lib/subscription/live-limits`).
 *
 * Pure functions, no mocks. Covers:
 *  - tier resolution from subscription status (active → standard, trialing →
 *    trial, everything else / null → none)
 *  - per-plan cap seconds (20 min / 10 min / 0)
 *  - the LIVE_CAP_TEST_MINUTES override (and that it never uncaps a `none` user)
 *  - enforcement flag parsing (LIVE_CAP_ENFORCE)
 *  - local day-key validation + UTC fallback
 *  - remaining-seconds clamping
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  resolveTier,
  resolveLiveDailyCapSeconds,
  isLiveCapEnforced,
  liveDayKey,
  remainingLiveSeconds,
  LIVE_DAILY_CAP_SECONDS,
} from '@/lib/subscription/live-limits'

const ENV_KEYS = ['LIVE_CAP_TEST_MINUTES', 'LIVE_CAP_ENFORCE'] as const

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('resolveTier', () => {
  it('maps active → standard, trialing → trial', () => {
    expect(resolveTier({ status: 'active' })).toBe('standard')
    expect(resolveTier({ status: 'trialing' })).toBe('trial')
  })

  it('is case-insensitive on status', () => {
    expect(resolveTier({ status: 'ACTIVE' })).toBe('standard')
    expect(resolveTier({ status: 'Trialing' })).toBe('trial')
  })

  it('maps null / unknown / unentitled statuses → none', () => {
    expect(resolveTier(null)).toBe('none')
    expect(resolveTier(undefined)).toBe('none')
    expect(resolveTier({})).toBe('none')
    expect(resolveTier({ status: 'past_due' })).toBe('none')
    expect(resolveTier({ status: 'canceled' })).toBe('none')
  })
})

describe('resolveLiveDailyCapSeconds', () => {
  it('returns the per-plan cap', () => {
    expect(resolveLiveDailyCapSeconds({ status: 'active' })).toBe(20 * 60)
    expect(resolveLiveDailyCapSeconds({ status: 'trialing' })).toBe(10 * 60)
    expect(resolveLiveDailyCapSeconds(null)).toBe(0)
  })

  it('matches the LIVE_DAILY_CAP_SECONDS table', () => {
    expect(resolveLiveDailyCapSeconds({ status: 'active' })).toBe(LIVE_DAILY_CAP_SECONDS.standard)
    expect(resolveLiveDailyCapSeconds({ status: 'trialing' })).toBe(LIVE_DAILY_CAP_SECONDS.trial)
  })

  it('honors LIVE_CAP_TEST_MINUTES override for entitled users', () => {
    process.env.LIVE_CAP_TEST_MINUTES = '1'
    expect(resolveLiveDailyCapSeconds({ status: 'active' })).toBe(60)
    expect(resolveLiveDailyCapSeconds({ status: 'trialing' })).toBe(60)
  })

  it('never uncaps a non-entitled user, even with the test override set', () => {
    process.env.LIVE_CAP_TEST_MINUTES = '5'
    expect(resolveLiveDailyCapSeconds(null)).toBe(0)
    expect(resolveLiveDailyCapSeconds({ status: 'canceled' })).toBe(0)
  })

  it('ignores a malformed / non-positive override', () => {
    process.env.LIVE_CAP_TEST_MINUTES = 'abc'
    expect(resolveLiveDailyCapSeconds({ status: 'active' })).toBe(20 * 60)
    process.env.LIVE_CAP_TEST_MINUTES = '0'
    expect(resolveLiveDailyCapSeconds({ status: 'active' })).toBe(20 * 60)
    process.env.LIVE_CAP_TEST_MINUTES = '-3'
    expect(resolveLiveDailyCapSeconds({ status: 'active' })).toBe(20 * 60)
  })
})

describe('isLiveCapEnforced', () => {
  it('defaults to false (shadow mode) when unset', () => {
    expect(isLiveCapEnforced()).toBe(false)
  })

  it('is true only for the exact "true" string (case-insensitive)', () => {
    process.env.LIVE_CAP_ENFORCE = 'true'
    expect(isLiveCapEnforced()).toBe(true)
    process.env.LIVE_CAP_ENFORCE = 'TRUE'
    expect(isLiveCapEnforced()).toBe(true)
    process.env.LIVE_CAP_ENFORCE = 'false'
    expect(isLiveCapEnforced()).toBe(false)
    process.env.LIVE_CAP_ENFORCE = '1'
    expect(isLiveCapEnforced()).toBe(false)
  })
})

describe('liveDayKey', () => {
  it('accepts a valid YYYY-MM-DD client date', () => {
    expect(liveDayKey('2026-07-01')).toBe('2026-07-01')
  })

  it('falls back to UTC today on malformed / missing input', () => {
    const utcToday = new Date().toISOString().split('T')[0]
    expect(liveDayKey(null)).toBe(utcToday)
    expect(liveDayKey(undefined)).toBe(utcToday)
    expect(liveDayKey('07/01/2026')).toBe(utcToday)
    expect(liveDayKey('not-a-date')).toBe(utcToday)
  })
})

describe('remainingLiveSeconds', () => {
  it('subtracts usage from the cap', () => {
    expect(remainingLiveSeconds(300, 1200)).toBe(900)
  })

  it('never goes negative', () => {
    expect(remainingLiveSeconds(1500, 1200)).toBe(0)
  })

  it('clamps negative usage to zero used', () => {
    expect(remainingLiveSeconds(-100, 1200)).toBe(1200)
  })
})
