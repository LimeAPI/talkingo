/**
 * Integration Test — End-to-end checkout per provider
 *
 * Feature: unified-payment-experience, Task 19.2
 * _Requirements: 5.9, 6.6, 14.3_
 *
 * Drives the full provider-agnostic happy path for BOTH providers (`stripe`
 * and `dodopayments`) through the *real* route handlers, mocking only the
 * external boundaries:
 *
 *   1. CREATE      POST /api/billing/checkout      → 200 { url }            (5.9)
 *   2. RETURN-SYNC POST /api/billing/sync-checkout → 200 premium snapshot   (6.6)
 *   3. STATUS      POST /api/billing/status        → premium reflected      (14.3)
 *
 * Because the routes import their collaborators at module scope (and resolve a
 * provider through the registry), we replace those collaborators with mocks:
 *
 *   - `@/lib/payments/guards`   originGuard / rateLimitGuard → pass (null)
 *   - `@/lib/api/auth-guard`    verifyAuth → valid user; validateOrigin → true;
 *                               checkRateLimit → allowed (used by the status route)
 *   - `@/lib/appwrite-server`   getSubscription → controllable per phase:
 *                                 • CREATE phase: no active subscription
 *                                 • STATUS phase: the persisted canonical doc
 *                                   (the real `toUnified` maps it)
 *   - `@/lib/payments/registry` getProvider → a per-provider stub whose
 *                               createCheckout / syncFromCheckout / getStatus
 *                               return premium results.
 *
 * The real `toUnified` runs on the persisted doc in the status route, so the
 * status assertion exercises the canonical read shim end to end.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type {
  ProviderId,
  UnifiedSubscription,
} from '@/lib/payments/provider'
import type { SubscriptionDoc } from '@/lib/appwrite-server'

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

// Shared mutable stored-subscription state read by the mocked `getSubscription`.
// During CREATE it is `null` (no active sub → double-charge guard passes); during
// STATUS it holds the persisted canonical doc.
let storedDoc: SubscriptionDoc | null = null

vi.mock('@/lib/payments/guards', () => ({
  // Both mutating-route guards pass so we exercise the full happy path.
  originGuard: vi.fn(() => null),
  rateLimitGuard: vi.fn(() => null),
}))

vi.mock('@/lib/api/auth-guard', () => ({
  // Always authenticated as the user under test.
  verifyAuth: vi.fn(async () => ({ userId: 'user-e2e', jwt: 'jwt-e2e' })),
  // Used by the status route (it imports these three from auth-guard).
  validateOrigin: vi.fn(() => true),
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}))

vi.mock('@/lib/appwrite-server', () => ({
  getSubscription: vi.fn(async () => storedDoc),
}))

vi.mock('@/lib/payments/registry', () => ({
  getProvider: vi.fn(),
}))

import { getProvider } from '@/lib/payments/registry'
import { getSubscription } from '@/lib/appwrite-server'
import { POST as checkoutPOST } from '@/app/api/billing/checkout/route'
import { POST as syncPOST } from '@/app/api/billing/sync-checkout/route'
import { POST as statusPOST } from '@/app/api/billing/status/route'

const getProviderMock = vi.mocked(getProvider)
const getSubscriptionMock = vi.mocked(getSubscription)

// ─── Helpers ───────────────────────────────────────────────────────────────

const APP_URL = 'https://app.talkingo.ai'

function makeReq(path: string, body: unknown): NextRequest {
  return new NextRequest(`${APP_URL}${path}`, {
    method: 'POST',
    headers: { origin: APP_URL, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** A confirmed, premium-granting unified subscription for `provider`. */
function premiumSubscription(provider: ProviderId): UnifiedSubscription {
  return {
    provider,
    providerCustomerId: `cus_${provider}_e2e`,
    providerSubscriptionId: `sub_${provider}_e2e`,
    status: 'active',
    plan: 'monthly',
    periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
    cancelAtPeriodEnd: false,
    updatedAt: Date.now(),
  }
}

/** The canonical persisted doc the status route reads (mapped by `toUnified`). */
function persistedDoc(provider: ProviderId): SubscriptionDoc {
  const s = premiumSubscription(provider)
  return {
    userId: 'user-e2e',
    provider: s.provider,
    providerCustomerId: s.providerCustomerId,
    providerSubscriptionId: s.providerSubscriptionId,
    status: s.status,
    plan: s.plan,
    periodEnd: s.periodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    updatedAt: s.updatedAt,
  } as SubscriptionDoc
}

/**
 * Build a per-provider stub returned by the registry. `createCheckout` yields a
 * hosted url, `syncFromCheckout` and `getStatus` yield the confirmed premium
 * snapshot for that provider.
 */
function providerStub(provider: ProviderId) {
  const premium = premiumSubscription(provider)
  return {
    id: provider,
    isEnabled: () => true,
    createCheckout: vi.fn(async () => ({
      url: `https://checkout.${provider}.test/session_e2e`,
      providerCustomerId: premium.providerCustomerId,
    })),
    syncFromCheckout: vi.fn(async () => premium),
    getStatus: vi.fn(async () => premium),
  } as unknown as ReturnType<typeof getProvider>
}

// ─── End-to-end flow, parameterized over both providers ──────────────────────

describe.each<ProviderId>(['stripe', 'dodopayments'])(
  'end-to-end checkout flow — %s',
  (provider) => {
    beforeEach(() => {
      vi.clearAllMocks()
      storedDoc = null
      // Every registry resolution returns the matching per-provider stub.
      getProviderMock.mockImplementation(() => providerStub(provider))
    })

    it('drives create → sync → status and reflects premium', async () => {
      // ── 1. CREATE: POST /api/billing/checkout → 200 { url } (Req 5.9) ──────
      storedDoc = null // no active subscription → double-charge guard passes
      const createRes = await checkoutPOST(
        makeReq('/api/billing/checkout', { provider, plan: 'monthly' }),
      )
      expect(createRes.status).toBe(200)
      const createJson = (await createRes.json()) as { url?: string }
      expect(typeof createJson.url).toBe('string')
      expect(createJson.url).toBe(`https://checkout.${provider}.test/session_e2e`)

      // ── 2. RETURN-SYNC: POST /api/billing/sync-checkout → 200 premium (6.6) ─
      const syncRes = await syncPOST(
        makeReq('/api/billing/sync-checkout', {
          provider,
          sessionId: `sess_${provider}_e2e`,
        }),
      )
      expect(syncRes.status).toBe(200)
      const syncJson = (await syncRes.json()) as {
        provider?: ProviderId
        status?: string
      }
      expect(syncJson.provider).toBe(provider)
      // Premium: a confirmed, access-granting status.
      expect(['active', 'trialing']).toContain(syncJson.status)

      // ── 3. STATUS: POST /api/billing/status → premium reflected (14.3) ─────
      // The subscription is now persisted; the status route resolves the
      // provider from the canonical `provider` field and returns its state.
      storedDoc = persistedDoc(provider)
      const statusRes = await statusPOST(makeReq('/api/billing/status', {}))
      expect(statusRes.status).toBe(200)
      const statusJson = (await statusRes.json()) as {
        status?: string
        provider?: ProviderId
        plan?: string
      }
      expect(['active', 'trialing']).toContain(statusJson.status)
      expect(statusJson.provider).toBe(provider)
      expect(statusJson.plan).toBe('monthly')

      // The status route asked the same provider for authoritative state.
      expect(getSubscriptionMock).toHaveBeenCalled()
    })
  },
)
