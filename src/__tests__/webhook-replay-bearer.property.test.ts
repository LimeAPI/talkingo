/**
 * Property test — Property 23: Server-to-server endpoints reject any non-matching bearer.
 *
 * **Validates: Requirements 5.5**
 *
 * The Main App `POST /api/webhook/replay` endpoint is a Server_To_Server_Call gate:
 * it authenticates the caller with `Authorization: Bearer <APPWRITE_API_KEY>` and,
 * for ANY bearer that is not exactly the configured `APPWRITE_API_KEY` — a missing
 * header, an empty header, a wrong key, or a malformed value — it MUST reject the
 * request with an authorization error (401) and MUST NOT perform any handler work
 * (Req 5.5). Concretely "no handler work" means it never loads the dead-letter
 * entry, never re-runs the replay/apply path, and never marks an entry resolved.
 *
 * The property below drives the real `POST` handler with generated `Authorization`
 * header values, using vitest module mocks as spies over the only three gateways the
 * handler can use to do work or mutate state:
 *   - `getDeadLetterEvent`     (loads the stored entry)
 *   - `replayDeadLetter`       (re-runs the canonical apply path)
 *   - `markDeadLetterResolved` (the resolved mutation)
 *
 * For every non-matching bearer we assert: status 401 AND none of the three spies
 * were invoked. The control case asserts the EXACT correct bearer is accepted: the
 * handler proceeds past auth (status ≠ 401) and the entry is loaded.
 *
 * Uses Vitest + fast-check. `APPWRITE_API_KEY` is set for the test in `beforeEach`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fc from 'fast-check'
import type { NextRequest } from 'next/server'

// ─── Module mocks (hoisted above imports by vitest) ──────────────────────────
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

/**
 * Mirror the route's token extraction so generated headers can be filtered to
 * guarantee they do NOT extract to the exact configured key. The route strips a
 * single leading `Bearer ` (case-insensitive, with whitespace) then trims.
 */
function extractToken(header: string | undefined): string {
  return (header ?? '').replace(/^Bearer\s+/i, '').trim()
}

/** Build a minimal NextRequest stub exposing only what the handler reads. */
function makeReq(header: string | undefined): NextRequest {
  const headers = new Headers()
  if (header !== undefined) headers.set('authorization', header)
  return {
    headers,
    // The handler only reaches `json()` AFTER auth passes; provide a valid body
    // so the control case can proceed deterministically.
    json: async () => ({ deadLetterId: 'dl_1' }),
  } as unknown as NextRequest
}

beforeEach(() => {
  process.env.APPWRITE_API_KEY = APPWRITE_API_KEY
  vi.clearAllMocks()
  // Default happy-path implementations for the control case: a loadable entry,
  // a provider, a succeeding replay, and a successful resolve mutation.
  mockGetDeadLetterEvent.mockResolvedValue({
    $id: 'dl_1',
    eventId: 'stripe:evt_1',
    eventType: 'customer.subscription.updated',
    rawBody: '{}',
    resolved: false,
  })
  mockGetProvider.mockReturnValue({ id: 'stripe' } as never)
  mockReplayDeadLetter.mockResolvedValue(undefined as never)
  mockMarkResolved.mockResolvedValue(true)
})

// ─── Arbitraries ──────────────────────────────────────────────────────────────
/**
 * Any Authorization header value that is NOT the exact correct bearer. Covers:
 *   - a missing header (`undefined`)
 *   - an empty header (`''`)
 *   - bare/partial `Bearer` prefixes
 *   - arbitrary strings (wrong/malformed tokens)
 *   - well-formed `Bearer <token>` with a wrong token
 *   - other schemes (`Basic ...`)
 * Filtered so the extracted token never equals the configured key.
 */
const nonMatchingHeaderArb = fc
  .oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.constant('Bearer'),
    fc.constant('Bearer '),
    fc.constant('bearer'),
    fc.string(),
    fc.string().map((s) => `Bearer ${s}`),
    fc.string().map((s) => `bearer ${s}`),
    fc.string().map((s) => `Basic ${s}`),
    fc.string().map((s) => `Bearer  ${s}`),
  )
  .filter((h) => extractToken(h) !== APPWRITE_API_KEY)

describe('Property 23: Server-to-server endpoints reject any non-matching bearer', () => {
  it('rejects every non-matching bearer with 401 and performs NO handler work', async () => {
    /**Validates: Requirements 5.5*/
    await fc.assert(
      fc.asyncProperty(nonMatchingHeaderArb, async (header) => {
        // Reset call counts per iteration (implementations are preserved).
        mockGetDeadLetterEvent.mockClear()
        mockReplayDeadLetter.mockClear()
        mockMarkResolved.mockClear()

        const res = await POST(makeReq(header))

        // Req 5.5: authorization error.
        expect(res.status).toBe(401)

        // Req 5.5: NO handler work — the entry is never loaded, the replay/apply
        // path never runs, and no resolved mutation occurs.
        expect(mockGetDeadLetterEvent).not.toHaveBeenCalled()
        expect(mockReplayDeadLetter).not.toHaveBeenCalled()
        expect(mockMarkResolved).not.toHaveBeenCalled()
      }),
      { numRuns: 200 },
    )
  })

  it('accepts the exact correct bearer (control): proceeds past auth and loads the entry', async () => {
    /**Validates: Requirements 5.5*/
    mockGetDeadLetterEvent.mockClear()

    const res = await POST(makeReq(`Bearer ${APPWRITE_API_KEY}`))

    // The correct bearer must NOT be rejected as unauthorized.
    expect(res.status).not.toBe(401)
    // Auth passed → the handler proceeded into its work (loaded the entry).
    expect(mockGetDeadLetterEvent).toHaveBeenCalledWith('dl_1')
  })
})
