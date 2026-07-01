/**
 * `handleWebhook` — the single, provider-agnostic webhook entry path.
 *
 * Both `/api/stripe/webhook` and `/api/webhook/dodo-payments` delegate to this
 * one function so signature verification, idempotency, the apply step, and
 * dead-lettering behave identically regardless of provider. This is the
 * implementation of the design's `ALGORITHM handleWebhook`.
 *
 * Algorithm (design.md → "Unified webhook entry (per provider)"):
 *   1. `provider.verifyWebhook(rawBody, signature, headers)` over the RAW body.
 *      Throws (bad/missing signature or unconfigured secret) → 400, no state
 *      change (Req 8.1 / 8.2).
 *   2. Claim the event in the idempotency store under `${provider}:${rawId}`
 *      (retained ≥30 days by the collection). Already claimed → 200 duplicate
 *      no-op (Req 8.3 / 8.4). Store unavailable (claim throws) → non-2xx so the
 *      provider retries, no state change (Req 8.9).
 *   3. First claim: if the event carries a subscription → persist via
 *      `syncToAppwrite` (Req 8.5); otherwise apply the corresponding status
 *      transition (Req 8.6). userId is resolved from the event, falling back to
 *      a customer-id lookup.
 *   4. The apply step throwing → dead-letter the raw payload + failure (retained
 *      ≥30 days) and return 200 dead_letter (Req 8.7).
 *   5. Always respond within 10 seconds (Req 8.10): the apply step races a hard
 *      timeout; a timeout is treated as a processing failure (dead-lettered).
 *
 * Webhook routes are exempt from origin/CSRF checks (Req 15.5 — authenticated by
 * signature) and must hand us the unmodified raw body (Req 15.6).
 *
 * Appwrite dependencies are injected (defaulting to the real admin helpers) so
 * the property test (15.2) and unit tests (15.3) can drive the handler against
 * in-memory fakes without mocking modules.
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10, 15.5, 15.6_
 */

import type {
  NormalizedEvent,
  PaymentProvider,
  ProviderId,
  UnifiedStatus,
  UnifiedSubscription,
} from './provider'
import { syncToAppwrite } from './sync'
import type { SubscriptionDoc } from '@/lib/appwrite-server'

/** Maximum time the apply phase may take before we respond (Req 8.10). */
const APPLY_TIMEOUT_MS = 10_000

/**
 * Event types (across both providers) that represent a pure status transition
 * carrying no subscription snapshot. Subscription-lifecycle events instead carry
 * `event.subscription` and flow through `syncToAppwrite`.
 */
const PAST_DUE_EVENTS = new Set([
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'payment_intent.payment_failed',
  'payment.failed',
  // Dodo: subscription temporarily suspended for a failed renewal (recoverable).
  'subscription.on_hold',
  'subscription.failed',
])
const EXPIRED_EVENTS = new Set([
  'charge.dispute.created',
  // Dodo: subscription reached the end of its life with no renewal.
  'subscription.expired',
])
const CANCELED_EVENTS = new Set([
  'charge.refunded',
  'subscription.cancelled',
  'subscription.canceled',
])

/** Map a raw provider event type to the status transition it implies, if any. */
function statusFromEventType(type: string): UnifiedStatus | undefined {
  const t = (type || '').toLowerCase()
  if (PAST_DUE_EVENTS.has(t)) return 'past_due'
  if (EXPIRED_EVENTS.has(t)) return 'expired'
  if (CANCELED_EVENTS.has(t)) return 'canceled'
  return undefined
}

/** The Appwrite operations the handler depends on. Injected for testability. */
export interface WebhookHandlerDeps {
  /** Claim an event id; true on first sight, false on duplicate, throws if the store is unavailable. */
  claimWebhookEvent: (eventId: string, eventType: string) => Promise<boolean>
  /** Capture a failed event for replay. Best-effort. */
  logDeadLetterEvent: (
    eventId: string,
    eventType: string,
    errorMessage: string,
    rawBody?: string,
  ) => Promise<boolean>
  /** Persist a unified subscription snapshot race-safely. */
  syncToAppwrite: typeof syncToAppwrite
  /** Read a user's stored subscription (used to preserve plan/customer on status transitions). */
  getSubscription: (userId: string) => Promise<SubscriptionDoc | null>
  /** Resolve a userId from a Stripe customer id. */
  getSubscriptionByCustomerId: (customerId: string) => Promise<SubscriptionDoc | null>
  /** Resolve a userId from a Dodo customer id. */
  getSubscriptionByDodoCustomerId: (customerId: string) => Promise<SubscriptionDoc | null>
}

/** Lazily-resolved default dependencies backed by the real Appwrite admin helpers. */
async function defaultDeps(): Promise<WebhookHandlerDeps> {
  const mod = await import('@/lib/appwrite-server')
  return {
    claimWebhookEvent: mod.claimWebhookEvent,
    logDeadLetterEvent: mod.logDeadLetterEvent,
    syncToAppwrite,
    getSubscription: (userId) => mod.getSubscription(userId),
    getSubscriptionByCustomerId: mod.getSubscriptionByCustomerId,
    getSubscriptionByDodoCustomerId: mod.getSubscriptionByDodoCustomerId,
  }
}

/** JSON `Response` helper (works in the Node webhook runtime). */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Reject a hanging apply step so the handler always responds within the budget. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('webhook_apply_timeout')), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

/** Resolve our userId from the event, falling back to a per-provider customer lookup. */
async function resolveUserId(
  providerId: ProviderId,
  event: NormalizedEvent,
  deps: WebhookHandlerDeps,
): Promise<string | undefined> {
  if (event.userId) return event.userId
  if (!event.customerId) return undefined
  const doc =
    providerId === 'dodopayments'
      ? await deps.getSubscriptionByDodoCustomerId(event.customerId)
      : await deps.getSubscriptionByCustomerId(event.customerId)
  return doc?.userId ?? undefined
}

/**
 * Apply a status-transition event (no subscription snapshot) by reading the
 * user's stored subscription to preserve plan/customer/ids and persisting the
 * new status through the shared writer. Unrecognized/informational events
 * (e.g. `customer.updated`, `trial_will_end`, `payment_method.attached`) are a
 * no-op — they're still idempotency-tracked but change no state.
 */
async function applyStatusTransition(
  providerId: ProviderId,
  event: NormalizedEvent,
  deps: WebhookHandlerDeps,
): Promise<void> {
  const targetStatus = statusFromEventType(event.type)
  if (!targetStatus) return // informational event — nothing to transition

  const userId = await resolveUserId(providerId, event, deps)
  if (!userId) return // cannot attribute the event to a user — skip

  const existing = await deps.getSubscription(userId)
  const providerCustomerId =
    event.customerId ??
    existing?.providerCustomerId ??
    existing?.stripeCustomerId ??
    existing?.dodopaymentsCustomerId
  if (!providerCustomerId) return // no customer id to anchor the write

  const providerSubscriptionId =
    existing?.providerSubscriptionId ??
    existing?.stripeSubscriptionId ??
    existing?.dodopaymentsSubscriptionId

  const unified: UnifiedSubscription = {
    provider: providerId,
    providerCustomerId,
    providerSubscriptionId,
    status: targetStatus,
    plan: (existing?.plan as 'monthly' | 'yearly') || 'monthly',
    trialEnd: existing?.trialEnd,
    periodEnd: existing?.periodEnd,
    // Preserve the prior cancel flag for a (recoverable) past_due; a terminal
    // canceled/expired clears it.
    cancelAtPeriodEnd:
      targetStatus === 'past_due' ? (existing?.cancelAtPeriodEnd ?? false) : false,
    // Stamp with the PROVIDER event time (not processing time) so the monotonic
    // guard in syncToAppwrite orders this transition correctly against other
    // deliveries — a delayed past_due can no longer overwrite a newer
    // reactivation. Falls back to now only when the provider gave no event time.
    updatedAt: event.eventTime ?? Date.now(),
  }

  await deps.syncToAppwrite(userId, unified)
}

/**
 * Apply a normalized event to persisted state — the SAME apply branch used by
 * `handleWebhook` for a live delivery. Extracted so the replay path
 * (`replayDeadLetter`) applies identical state without duplicating the
 * provider-agnostic apply logic.
 *
 * A subscription-carrying event is attributed to a user (the event's userId,
 * else a customer-id lookup) and persisted via `syncToAppwrite`; an
 * unattributable subscription event throws so the caller can dead-letter or
 * report it. Other events flow through `applyStatusTransition`.
 */
export async function applyEvent(
  providerId: ProviderId,
  event: NormalizedEvent,
  deps: WebhookHandlerDeps,
): Promise<void> {
  if (event.subscription) {
    const userId = event.userId ?? (await resolveUserId(providerId, event, deps))
    if (!userId) {
      throw new Error(
        `unattributable_subscription_event: no userId and no customer match ` +
          `(customerId=${event.customerId ?? 'none'})`,
      )
    }
    await deps.syncToAppwrite(userId, event.subscription)

    // Best-effort promo/referral redemption capture. Only fires when the event
    // carries promo context (a code was applied) and the subscription is paid;
    // idempotent and never throws, so it can't disrupt the apply path.
    if (event.promo) {
      const { recordRedemptionFromEvent } = await import('./redemptions')
      await recordRedemptionFromEvent(providerId, userId, event)
    }
  } else {
    await applyStatusTransition(providerId, event, deps)
  }
}

/**
 * Provider-agnostic webhook entry point. Returns a `Response` the route returns
 * verbatim. `signature` is the provider's signature header value (Stripe's
 * `stripe-signature` / Dodo's `webhook-signature`); `headers` is forwarded so
 * providers that read multiple signature headers (Dodo) can do so.
 */
export async function handleWebhook(
  provider: PaymentProvider,
  rawBody: string,
  signature: string | null,
  headers: Headers,
  injectedDeps?: WebhookHandlerDeps,
): Promise<Response> {
  const deps = injectedDeps ?? (await defaultDeps())

  // 1. Verify the signature over the RAW body. Any throw → 400, no state change.
  let event: NormalizedEvent
  try {
    event = await provider.verifyWebhook(rawBody, signature, headers)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'signature verification failed'
    console.error(`[webhook:${provider.id}] signature verification failed:`, msg)
    return json({ error: 'invalid_signature' }, 400)
  }

  // 2. Claim the event for idempotency under `${provider}:${rawId}`.
  let claimed: boolean
  try {
    claimed = await deps.claimWebhookEvent(event.id, event.type)
  } catch (err) {
    // Idempotency store unavailable — return non-2xx so the provider retries.
    // No state change (Req 8.9).
    const msg = err instanceof Error ? err.message : 'idempotency store unavailable'
    console.error(`[webhook:${provider.id}] idempotency store unavailable:`, msg)
    return json({ error: 'idempotency_unavailable' }, 503)
  }

  if (!claimed) {
    // Duplicate delivery — 200 no-op, no re-application (Req 8.4).
    return json({ received: true, duplicate: true })
  }

  // 3 + 4. Apply within the response budget; dead-letter on failure/timeout.
  try {
    await withTimeout(applyEvent(provider.id, event, deps), APPLY_TIMEOUT_MS)
    return json({ received: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[webhook:${provider.id}] handler error:`, msg)
    // Capture to the dead-letter queue (raw payload + failure) for replay and
    // return 200 so the provider stops blind retries (Req 8.7).
    await deps.logDeadLetterEvent(event.id, event.type, msg, rawBody).catch(() => {})
    return json({ received: true, dead_letter: true })
  }
}

/**
 * Replay a stored dead-letter payload through the canonical apply path.
 *
 * Unlike `handleWebhook`, replay does NOT verify a provider signature: the raw
 * body is replayed from our own trusted, bearer-authenticated dead-letter store
 * and carries no fresh signature. It reuses the provider's
 * `parseWebhookForReplay` to normalize the body into the SAME `NormalizedEvent`
 * shape `verifyWebhook` produces, then runs the shared `applyEvent` branch — so
 * a replay applies identical state to a live delivery (no duplicated provider
 * code).
 *
 * Throws on any parse/apply failure so the caller can leave the entry unresolved
 * and report the error; resolves to `{ ok: true }` when the apply step succeeds.
 */
export async function replayDeadLetter(
  provider: PaymentProvider,
  rawBody: string,
  injectedDeps?: WebhookHandlerDeps,
): Promise<{ ok: true }> {
  const parse = provider.parseWebhookForReplay
  if (typeof parse !== 'function') {
    throw new Error(`replay_unsupported: provider '${provider.id}' cannot parse a stored payload`)
  }
  const deps = injectedDeps ?? (await defaultDeps())
  const event = await parse.call(provider, rawBody)
  await applyEvent(provider.id, event, deps)
  return { ok: true }
}
