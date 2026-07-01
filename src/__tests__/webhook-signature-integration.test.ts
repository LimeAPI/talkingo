/**
 * Integration test — REAL signature → idempotency → DB → entitlement.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5 end-to-end**
 *
 * Every other webhook test stubs `verifyWebhook` (so signature crypto is never
 * exercised). This test closes that gap: it drives the WHOLE path with the
 * providers' REAL verification crypto —
 *   - Stripe: `stripe.webhooks.constructEvent` (HMAC over the raw body), with a
 *     header produced by `stripe.webhooks.generateTestHeaderString`.
 *   - Dodo: `standardwebhooks` `Webhook.sign` / `.verify`.
 * — through `handleWebhook` into the REAL race-safe `syncToAppwrite` writer
 * backed by an in-memory subscription store, then asserts the resulting
 * entitlement (active/trialing) is readable. It also proves a tampered body is
 * rejected (no state change) and a duplicate delivery is a no-op (idempotency).
 *
 * No network: the events carry `metadata.userId` (so user resolution is local)
 * and pure subscription objects (so plan detection never calls the provider).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Webhook } from 'standardwebhooks'
import { handleWebhook, type WebhookHandlerDeps } from '@/lib/payments/webhook-handler'
import { syncToAppwrite, type SyncDeps } from '@/lib/payments/sync'
import type { SubscriptionDoc } from '@/lib/appwrite-server'

// ── Test credentials (signing secrets are arbitrary; the point is real crypto) ─
const STRIPE_WEBHOOK_SECRET = 'whsec_test_integration_secret'
const DODO_WEBHOOK_SECRET = Buffer.from('dodo-integration-secret').toString('base64')
const DODO_PRODUCT_MONTHLY = 'pdt_monthly_test'

beforeAll(() => {
  // Stripe env (lazy-read on first provider access).
  process.env.STRIPE_SECRET_KEY = 'sk_test_integration'
  process.env.STRIPE_WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET
  process.env.STRIPE_PRICE_TRIAL = 'price_trial_test'
  process.env.STRIPE_PRICE_MONTHLY = 'price_monthly_test'
  process.env.STRIPE_PRICE_YEARLY = 'price_yearly_test'
  // Dodo env.
  process.env.DODOPAYMENTS_API_KEY = 'dodo_test_key'
  process.env.DODOPAYMENTS_WEBHOOK_SECRET = DODO_WEBHOOK_SECRET
  process.env.DODOPAYMENTS_PRODUCT_MONTHLY = DODO_PRODUCT_MONTHLY
  process.env.DODOPAYMENTS_PRODUCT_YEARLY = 'pdt_yearly_test'
})

/** Entitlement rule mirrors the server gate (active OR trialing → premium). */
function isEntitled(doc: SubscriptionDoc | null | undefined): boolean {
  return doc?.status === 'active' || doc?.status === 'trialing'
}

/**
 * Build a fresh in-memory world: a subscription store, the REAL `syncToAppwrite`
 * wired to it, and an idempotency set. `syncCalls` counts real applies so we can
 * prove a duplicate delivery does not re-apply.
 */
function makeWorld() {
  const store = new Map<string, SubscriptionDoc>()
  let syncCalls = 0

  const syncDeps: SyncDeps = {
    getSubscription: async (userId) => store.get(userId) ?? null,
    upsertSubscription: async (userId, fields) => {
      const prev = store.get(userId) ?? ({ userId } as SubscriptionDoc)
      store.set(userId, { ...prev, ...fields, userId } as SubscriptionDoc)
    },
    updateUserPrefs: async () => {},
    logSubscriptionEvent: async () => {},
  }

  const seenEventIds = new Set<string>()

  const deps: WebhookHandlerDeps = {
    claimWebhookEvent: async (id) => {
      if (seenEventIds.has(id)) return false
      seenEventIds.add(id)
      return true
    },
    logDeadLetterEvent: async () => true,
    syncToAppwrite: async (userId, unified) => {
      syncCalls++
      return syncToAppwrite(userId, unified, syncDeps)
    },
    getSubscription: async (userId) => store.get(userId) ?? null,
    getSubscriptionByCustomerId: async () => null,
    getSubscriptionByDodoCustomerId: async () => null,
  }

  return { store, deps, get syncCalls() { return syncCalls } }
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

describe('webhook integration — Stripe (real constructEvent signature)', () => {
  const userId = 'user_stripe_1'

  function stripeEventBody(eventId = 'evt_stripe_1'): string {
    return JSON.stringify({
      id: eventId,
      object: 'event',
      api_version: '2026-05-27.dahlia',
      created: 1_700_000_000,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_1',
          object: 'subscription',
          customer: 'cus_stripe_1',
          status: 'active',
          metadata: { userId },
          cancel_at_period_end: false,
          current_period_end: 1_700_100_000,
          items: {
            object: 'list',
            data: [
              {
                id: 'si_1',
                price: {
                  id: 'price_monthly_test',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        },
      },
    })
  }

  it('valid signature → event applied → entitlement granted', async () => {
    const { stripeProvider } = await import('@/lib/payments/stripe-provider')
    const { stripe } = await import('@/lib/stripe/client')
    const world = makeWorld()

    const body = stripeEventBody()
    const header = (stripe as any).webhooks.generateTestHeaderString({
      payload: body,
      secret: STRIPE_WEBHOOK_SECRET,
    })

    const res = await handleWebhook(stripeProvider, body, header, new Headers(), world.deps)

    expect(res.status).toBe(200)
    expect(isEntitled(world.store.get(userId))).toBe(true)
    expect(world.store.get(userId)?.status).toBe('active')
    // The event time (event.created * 1000) is used as the observation stamp.
    expect(world.store.get(userId)?.updatedAt).toBe(1_700_000_000_000)
  })

  it('tampered body → signature fails → 400 and NO state change', async () => {
    const { stripeProvider } = await import('@/lib/payments/stripe-provider')
    const { stripe } = await import('@/lib/stripe/client')
    const world = makeWorld()

    const signedBody = stripeEventBody()
    const header = (stripe as any).webhooks.generateTestHeaderString({
      payload: signedBody,
      secret: STRIPE_WEBHOOK_SECRET,
    })
    // Deliver a DIFFERENT body than the one that was signed.
    const tamperedBody = signedBody.replace('"status":"active"', '"status":"canceled"')

    const res = await handleWebhook(stripeProvider, tamperedBody, header, new Headers(), world.deps)

    expect(res.status).toBe(400)
    expect(world.store.get(userId)).toBeUndefined()
    expect(world.syncCalls).toBe(0)
  })

  it('duplicate delivery → idempotent no-op (applied exactly once)', async () => {
    const { stripeProvider } = await import('@/lib/payments/stripe-provider')
    const { stripe } = await import('@/lib/stripe/client')
    const world = makeWorld()

    const body = stripeEventBody()
    const header = (stripe as any).webhooks.generateTestHeaderString({
      payload: body,
      secret: STRIPE_WEBHOOK_SECRET,
    })

    const first = await handleWebhook(stripeProvider, body, header, new Headers(), world.deps)
    const second = await handleWebhook(stripeProvider, body, header, new Headers(), world.deps)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    await expect(second.clone().json()).resolves.toMatchObject({ duplicate: true })
    expect(world.syncCalls).toBe(1) // second delivery never re-applied
  })
})

// ─── Dodo ──────────────────────────────────────────────────────────────────

describe('webhook integration — Dodo (real standardwebhooks signature)', () => {
  const userId = 'user_dodo_1'

  function dodoBody(): string {
    return JSON.stringify({
      type: 'subscription.active',
      data: {
        subscription_id: 'sub_dodo_1',
        status: 'active',
        customer: { customer_id: 'cus_dodo_1' },
        metadata: { userId },
        product_id: DODO_PRODUCT_MONTHLY,
        next_billing_date: '2026-06-01T00:00:00Z',
      },
    })
  }

  function signedHeaders(body: string, msgId = 'msg_dodo_1') {
    const wh = new Webhook(DODO_WEBHOOK_SECRET)
    const timestamp = new Date()
    const signature = wh.sign(msgId, timestamp, body)
    return new Headers({
      'webhook-id': msgId,
      'webhook-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
      'webhook-signature': signature,
    })
  }

  it('valid signature → event applied → entitlement granted', async () => {
    const { dodoProvider } = await import('@/lib/payments/dodo-provider')
    const world = makeWorld()

    const body = dodoBody()
    const headers = signedHeaders(body)

    const res = await handleWebhook(dodoProvider, body, null, headers, world.deps)

    expect(res.status).toBe(200)
    expect(isEntitled(world.store.get(userId))).toBe(true)
    expect(world.store.get(userId)?.status).toBe('active')
  })

  it('tampered body → signature fails → 400 and NO state change', async () => {
    const { dodoProvider } = await import('@/lib/payments/dodo-provider')
    const world = makeWorld()

    const signedBody = dodoBody()
    const headers = signedHeaders(signedBody)
    const tamperedBody = signedBody.replace('"status":"active"', '"status":"canceled"')

    const res = await handleWebhook(dodoProvider, tamperedBody, null, headers, world.deps)

    expect(res.status).toBe(400)
    expect(world.store.get(userId)).toBeUndefined()
    expect(world.syncCalls).toBe(0)
  })
})
