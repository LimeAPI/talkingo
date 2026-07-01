/**
 * Unit tests — Webhook idempotency and dead-lettering
 *
 * Feature: unified-payment-experience, Task 15.3
 * _Requirements: 8.4, 8.7, 8.9_
 *
 * Exercises the idempotency / dead-letter branches of the shared, provider-
 * agnostic webhook entry path `handleWebhook` by driving it against:
 *   - a stub `PaymentProvider` whose `verifyWebhook` returns a fixed
 *     `NormalizedEvent` (so signature verification always succeeds and the test
 *     focuses purely on what happens AFTER a verified event), and
 *   - an injected `WebhookHandlerDeps` fake built from plain `vi.fn()`s, so no
 *     Appwrite module mocking is needed.
 *
 * Covered branches:
 *   · Duplicate delivery — `claimWebhookEvent` resolves false →
 *       200 { received:true, duplicate:true }, no apply, no dead-letter   (8.4)
 *   · Handler error — claim true but the apply step throws →
 *       `logDeadLetterEvent` captures id/type/raw body, 200 { dead_letter:true } (8.7)
 *   · Idempotency store unavailable — `claimWebhookEvent` throws →
 *       non-2xx (503), no apply, no dead-letter                          (8.9)
 *   · Happy path — claim true + apply succeeds →
 *       200 { received:true }, `syncToAppwrite` called                   (8.5 sanity)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type {
  NormalizedEvent,
  PaymentProvider,
  ProviderId,
  UnifiedSubscription,
} from '@/lib/payments/provider'
import type { SubscriptionDoc } from '@/lib/appwrite-server'
import type { WebhookHandlerDeps } from '@/lib/payments/webhook-handler'
import { handleWebhook } from '@/lib/payments/webhook-handler'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RAW_BODY = '{"id":"evt_raw_1","type":"subscription.active"}'
const SIGNATURE = 'sig_valid'

/** A confirmed subscription snapshot carried by a subscription-lifecycle event. */
function makeSubscription(): UnifiedSubscription {
  return {
    provider: 'stripe',
    providerCustomerId: 'cus_123',
    providerSubscriptionId: 'sub_123',
    status: 'active',
    plan: 'monthly',
    cancelAtPeriodEnd: false,
    updatedAt: 1_700_000_000_000,
  }
}

/** A normalized event that carries a subscription snapshot (→ syncToAppwrite path). */
function makeSubscriptionEvent(): NormalizedEvent {
  return {
    id: 'stripe:evt_raw_1',
    type: 'subscription.active',
    userId: 'user-1',
    customerId: 'cus_123',
    subscription: makeSubscription(),
  }
}

/**
 * Build a stub `PaymentProvider`. Only `verifyWebhook` is meaningful here; it
 * resolves the supplied normalized event so the handler always treats the
 * request as a verified event. The remaining interface methods are present to
 * satisfy the type but never invoked by `handleWebhook`.
 */
function makeStubProvider(
  event: NormalizedEvent,
  id: ProviderId = 'stripe',
): PaymentProvider {
  return {
    id,
    isEnabled: () => true,
    createCheckout: vi.fn(),
    syncFromCheckout: vi.fn(),
    getStatus: vi.fn(),
    cancel: vi.fn(),
    reactivate: vi.fn(),
    changePlan: vi.fn(),
    verifyWebhook: vi.fn(async () => event),
    reconcile: vi.fn(),
    getManageUrl: vi.fn(),
  } as unknown as PaymentProvider
}

/**
 * Build a `WebhookHandlerDeps` fake from plain `vi.fn()`s. Defaults model a
 * healthy store with a first-seen claim and a successful apply; individual
 * tests override the specific dep they want to exercise.
 */
function makeDeps(overrides: Partial<WebhookHandlerDeps> = {}): WebhookHandlerDeps {
  return {
    claimWebhookEvent: vi.fn(async () => true),
    logDeadLetterEvent: vi.fn(async () => true),
    syncToAppwrite: vi.fn(async () => {}),
    getSubscription: vi.fn(async () => null as SubscriptionDoc | null),
    getSubscriptionByCustomerId: vi.fn(async () => null as SubscriptionDoc | null),
    getSubscriptionByDodoCustomerId: vi.fn(async () => null as SubscriptionDoc | null),
    ...overrides,
  } as WebhookHandlerDeps
}

const headers = new Headers()

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('handleWebhook — idempotency and dead-lettering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('duplicate delivery → 200 { received:true, duplicate:true }, no apply (Req 8.4)', async () => {
    /** _Requirements: 8.4_ */
    const event = makeSubscriptionEvent()
    const provider = makeStubProvider(event)
    const deps = makeDeps({ claimWebhookEvent: vi.fn(async () => false) })

    const res = await handleWebhook(provider, RAW_BODY, SIGNATURE, headers, deps)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true, duplicate: true })

    // The event was claim-checked but, being a duplicate, never applied.
    expect(deps.claimWebhookEvent).toHaveBeenCalledWith(event.id, event.type)
    expect(deps.syncToAppwrite).not.toHaveBeenCalled()
    // A duplicate is a clean no-op — not a failure, so nothing is dead-lettered.
    expect(deps.logDeadLetterEvent).not.toHaveBeenCalled()
  })

  it('handler error → dead-letters raw payload and returns 200 { dead_letter:true } (Req 8.7)', async () => {
    /** _Requirements: 8.7_ */
    const event = makeSubscriptionEvent()
    const provider = makeStubProvider(event)
    const applyError = new Error('appwrite write failed')
    const deps = makeDeps({
      claimWebhookEvent: vi.fn(async () => true),
      syncToAppwrite: vi.fn(async () => {
        throw applyError
      }),
    })

    const res = await handleWebhook(provider, RAW_BODY, SIGNATURE, headers, deps)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true, dead_letter: true })

    // The apply was attempted (claim succeeded) and then failed.
    expect(deps.syncToAppwrite).toHaveBeenCalledTimes(1)

    // The failure is captured to the dead-letter store with the event id, type,
    // a failure message, and the unmodified raw body for replay.
    expect(deps.logDeadLetterEvent).toHaveBeenCalledTimes(1)
    expect(deps.logDeadLetterEvent).toHaveBeenCalledWith(
      event.id,
      event.type,
      applyError.message,
      RAW_BODY,
    )
  })

  it('idempotency store unavailable → non-2xx (503), no apply, no dead-letter (Req 8.9)', async () => {
    /** _Requirements: 8.9_ */
    const event = makeSubscriptionEvent()
    const provider = makeStubProvider(event)
    const deps = makeDeps({
      claimWebhookEvent: vi.fn(async () => {
        throw new Error('idempotency store down')
      }),
    })

    const res = await handleWebhook(provider, RAW_BODY, SIGNATURE, headers, deps)

    // Non-2xx so the provider retries delivery; the route returns 503.
    expect(res.status).toBe(503)
    expect(res.status).toBeGreaterThanOrEqual(300)
    await expect(res.json()).resolves.toEqual({ error: 'idempotency_unavailable' })

    // No state change and no dead-letter — the event was never claimed/applied.
    expect(deps.syncToAppwrite).not.toHaveBeenCalled()
    expect(deps.logDeadLetterEvent).not.toHaveBeenCalled()
  })

  it('happy path → 200 { received:true } and syncToAppwrite called once (Req 8.5 sanity)', async () => {
    const event = makeSubscriptionEvent()
    const provider = makeStubProvider(event)
    const deps = makeDeps()

    const res = await handleWebhook(provider, RAW_BODY, SIGNATURE, headers, deps)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true })

    // The subscription snapshot was persisted through the shared writer.
    expect(deps.syncToAppwrite).toHaveBeenCalledTimes(1)
    expect(deps.syncToAppwrite).toHaveBeenCalledWith(event.userId, event.subscription)
    // Successful processing is never dead-lettered.
    expect(deps.logDeadLetterEvent).not.toHaveBeenCalled()
  })

  it('status-transition event (no subscription) applies via status path and 200 { received:true } (Req 8.6 sanity)', async () => {
    // A verified event without a subscription snapshot drives the status path.
    const statusEvent: NormalizedEvent = {
      id: 'stripe:evt_raw_2',
      type: 'subscription.cancelled',
      userId: 'user-1',
      customerId: 'cus_123',
    }
    const provider = makeStubProvider(statusEvent)
    const existing: SubscriptionDoc = {
      userId: 'user-1',
      provider: 'stripe',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      plan: 'monthly',
    } as unknown as SubscriptionDoc
    const deps = makeDeps({
      getSubscription: vi.fn(async () => existing),
    })

    const res = await handleWebhook(provider, RAW_BODY, SIGNATURE, headers, deps)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true })
    // The cancellation transition is persisted as a canceled status.
    expect(deps.syncToAppwrite).toHaveBeenCalledTimes(1)
    const [, written] = (deps.syncToAppwrite as ReturnType<typeof vi.fn>).mock.calls[0]
    expect((written as UnifiedSubscription).status).toBe('canceled')
    expect(deps.logDeadLetterEvent).not.toHaveBeenCalled()
  })
})
