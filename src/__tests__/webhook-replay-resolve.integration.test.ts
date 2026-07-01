/**
 * Integration Test — Replay marks the entry resolved on success
 *
 * Feature: admin-payment-operations, Task 12.5.
 *
 * **Validates: Requirements 5.2**
 *
 * Req 5.2: WHEN the Replay_Endpoint re-runs the webhook handler successfully,
 * THE Main App SHALL set the corresponding Dead_Letter_Queue entry's `resolved`
 * field to true AND SHALL return a success result.
 *
 * This drives the production `POST /api/webhook/replay` route handler end-to-end
 * with the canonical apply path STUBBED (`replayDeadLetter` mocked), mirroring the
 * conventions of `webhook-replay-bearer.property.test.ts` (vitest module mocks over
 * the route's three collaborators — no live network). We model the dead-letter row
 * as an in-memory doc whose `resolved` flag starts `false`; the
 * `markDeadLetterResolved` stub flips it to `true` exactly as the real Appwrite
 * write would.
 *
 * The success case asserts:
 *   1. the route returns `{ success: true }` (the success result), and
 *   2. the entry's `resolved` field is written to `true` — `markDeadLetterResolved`
 *      is invoked with the entry id and the modelled DLQ doc becomes `resolved=true`.
 *   3. ordering: the apply path runs BEFORE the resolve write, so an entry is only
 *      ever resolved after a successful apply.
 *
 * The companion contrast case STUBS the apply path to THROW, then asserts the route
 * returns `{ success: false, error }` AND that `markDeadLetterResolved` is NEVER
 * invoked — so a failed replay never resolves the entry (the Req 5.3 contrast that
 * gives the success write its meaning).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Module mocks (hoisted above imports by vitest) ───────────────────────────
vi.mock('@/lib/appwrite-server', () => ({
  getDeadLetterEvent: vi.fn(),
  markDeadLetterResolved: vi.fn(),
}))

vi.mock('@/lib/payments/webhook-handler', () => ({
  replayDeadLetter: vi.fn(),
}))

vi.mock('@/lib/payments/registry', () => ({
  getProvider: vi.fn(),
}))

// Import the mocked collaborators and the unit under test AFTER the mocks.
import { getDeadLetterEvent, markDeadLetterResolved } from '@/lib/appwrite-server'
import { replayDeadLetter } from '@/lib/payments/webhook-handler'
import { getProvider } from '@/lib/payments/registry'
import { POST } from '@/app/api/webhook/replay/route'

const mockGetDeadLetterEvent = vi.mocked(getDeadLetterEvent)
const mockMarkResolved = vi.mocked(markDeadLetterResolved)
const mockReplayDeadLetter = vi.mocked(replayDeadLetter)
const mockGetProvider = vi.mocked(getProvider)

// ─── The configured shared key the endpoint trusts ───────────────────────────
const APPWRITE_API_KEY = 'test-appwrite-api-key-abc123XYZ'

/** The modelled dead-letter row the route loads + may resolve. */
interface FakeDeadLetterDoc {
  $id: string
  eventId: string
  eventType: string
  rawBody: string
  resolved: boolean
}

let entry: FakeDeadLetterDoc
/** Records the order of the apply vs resolve side effects within a run. */
const callOrder: string[] = []

/** Build a minimal NextRequest stub exposing only what the handler reads. */
function makeReq(body: unknown): NextRequest {
  const headers = new Headers()
  headers.set('authorization', `Bearer ${APPWRITE_API_KEY}`)
  return {
    headers,
    json: async () => body,
  } as unknown as NextRequest
}

beforeEach(() => {
  process.env.APPWRITE_API_KEY = APPWRITE_API_KEY
  vi.clearAllMocks()
  callOrder.length = 0

  // A loadable, unresolved dead-letter entry whose stored body would apply cleanly.
  entry = {
    $id: 'dl_1',
    eventId: 'stripe:evt_1',
    eventType: 'customer.subscription.updated',
    rawBody: '{"id":"evt_1"}',
    resolved: false,
  }

  // The route loads the entry by id (return a copy, as a real read would).
  mockGetDeadLetterEvent.mockImplementation(async () => ({ ...entry }))
  // Provider resolution succeeds (stripe, derived from the `stripe:` event id).
  mockGetProvider.mockReturnValue({ id: 'stripe' } as never)
  // The resolve write flips the modelled DLQ doc's `resolved` flag to true,
  // exactly as the real Appwrite update would.
  mockMarkResolved.mockImplementation(async (id: string) => {
    callOrder.push('resolve')
    if (id === entry.$id) entry.resolved = true
    return true as never
  })
})

describe('Task 12.5: replay marks the entry resolved on success', () => {
  it('returns { success: true } and writes resolved=true when the apply path succeeds', async () => {
    /**Validates: Requirements 5.2*/
    // STUBBED apply path that SUCCEEDS — the canonical replay resolves with no throw.
    mockReplayDeadLetter.mockImplementation(async () => {
      callOrder.push('apply')
      return { ok: true } as never
    })

    const res = await POST(makeReq({ deadLetterId: 'dl_1' }))

    // (1) The route returns a success result.
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })

    // (2) The entry's `resolved` field is written to true (Req 5.2): the resolve
    // mutation is invoked once with the entry id and the modelled doc flips to true.
    expect(mockMarkResolved).toHaveBeenCalledTimes(1)
    expect(mockMarkResolved).toHaveBeenCalledWith('dl_1')
    expect(entry.resolved).toBe(true)
  })

  it('runs the apply path over the stored rawBody BEFORE marking resolved', async () => {
    /**Validates: Requirements 5.2*/
    mockReplayDeadLetter.mockImplementation(async () => {
      callOrder.push('apply')
      return { ok: true } as never
    })

    await POST(makeReq({ deadLetterId: 'dl_1' }))

    // The canonical apply path is invoked with the resolved provider and the
    // entry's stored rawBody...
    expect(mockReplayDeadLetter).toHaveBeenCalledTimes(1)
    expect(mockReplayDeadLetter).toHaveBeenCalledWith({ id: 'stripe' }, '{"id":"evt_1"}')
    // ...and the resolve write only happens AFTER a successful apply, so an entry
    // is never resolved before its replay succeeds (Req 5.2).
    expect(callOrder).toEqual(['apply', 'resolve'])
  })

  it('companion contrast: a throwing apply path returns success:false and NEVER resolves the entry', async () => {
    /**Validates: Requirements 5.2 (contrast via 5.3)*/
    // STUBBED apply path that FAILS — the canonical replay throws.
    mockReplayDeadLetter.mockImplementation(async () => {
      callOrder.push('apply')
      throw new Error('apply_failed: simulated replay failure')
    })

    const res = await POST(makeReq({ deadLetterId: 'dl_1' }))

    // The route reports failure (not a success result) ...
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(typeof body.error).toBe('string')
    expect(body.error.length).toBeGreaterThan(0)

    // ... and the entry is NEVER marked resolved when the apply path fails, so the
    // resolved=true write of Req 5.2 happens ONLY on a successful apply.
    expect(mockMarkResolved).not.toHaveBeenCalled()
    expect(entry.resolved).toBe(false)
    expect(callOrder).toEqual(['apply'])
  })
})
