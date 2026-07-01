import 'server-only'

/**
 * Server-side Appwrite helpers — split into TWO clients with very different
 * privilege levels. Pick the right one for the job.
 *
 * 1. ADMIN client  (uses APPWRITE_API_KEY, full database access, bypasses permissions)
 *    Use ONLY when there is no authenticated user context — i.e. the Stripe
 *    webhook (Stripe is the caller, no user JWT) and server-only collections
 *    like `free_tier_usage` / `stripe_webhook_events` that users must not be
 *    able to read or write directly.
 *
 * 2. USER client   (uses the request's X-Appwrite-JWT, respects per-doc permissions)
 *    Use whenever an authenticated user is making the request. Reads/writes
 *    are scoped to that user, so a permission misconfig becomes a 401, not a
 *    cross-user data leak.
 *
 * The `'server-only'` import at the top of this file makes Next.js refuse to
 * bundle it into any client component — the API key cannot accidentally end
 * up in the browser.
 */

import { Client, Databases, Users, Query, ID } from 'node-appwrite'
import type { NextRequest } from 'next/server'
import { APPWRITE_DB_ID, COLLECTION_IDS } from './appwrite-schema'

// ─── Env validation ──────────────────────────────────────────────────────────

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const API_KEY = process.env.APPWRITE_API_KEY

function requireBaseEnv() {
  if (!ENDPOINT || !PROJECT_ID) {
    throw new Error(
      '[appwrite-server] NEXT_PUBLIC_APPWRITE_ENDPOINT and NEXT_PUBLIC_APPWRITE_PROJECT_ID are required.'
    )
  }
}

// ─── Admin client (lazily-instantiated so missing API key only errors if used) ──

let _adminClient: Client | null = null
let _adminDatabases: Databases | null = null
let _adminUsers: Users | null = null

function ensureAdmin() {
  if (_adminDatabases && _adminUsers) return
  requireBaseEnv()
  if (!API_KEY) {
    throw new Error(
      '[appwrite-server] APPWRITE_API_KEY is required for admin-context operations ' +
      '(webhook, server-only collections). Set it in .env.local.'
    )
  }
  _adminClient = new Client().setEndpoint(ENDPOINT!).setProject(PROJECT_ID!).setKey(API_KEY)
  _adminDatabases = new Databases(_adminClient)
  _adminUsers = new Users(_adminClient)
}

/** Admin Databases instance. Bypasses all permissions. Use sparingly. */
export function getAdminDatabases(): Databases {
  ensureAdmin()
  return _adminDatabases!
}

/** Admin Users instance. Bypasses all permissions. Use sparingly. */
export function getAdminUsers(): Users {
  ensureAdmin()
  return _adminUsers!
}

// Backwards-compat exports for code still using the old names.
// New code should call getAdminDatabases() / getAdminUsers() to make the
// privilege boundary obvious.
export const databases = new Proxy({} as Databases, {
  get(_t, p) { return (getAdminDatabases() as any)[p] },
})
export const users = new Proxy({} as Users, {
  get(_t, p) { return (getAdminUsers() as any)[p] },
})

// ─── User-context client ────────────────────────────────────────────────────

/**
 * Build a node-appwrite client that operates as the user identified by the
 * given JWT. Reads/writes respect per-document permissions — a logged-in user
 * can only see/touch rows they own.
 *
 * Pass `req` to extract the JWT from the X-Appwrite-JWT header automatically.
 */
export function getUserDatabases(jwtOrReq: string | NextRequest): Databases {
  const jwt = typeof jwtOrReq === 'string'
    ? jwtOrReq
    : (jwtOrReq.headers.get('x-appwrite-jwt') || jwtOrReq.headers.get('x-appwrite-session') || '')

  if (!jwt) {
    throw new Error('[appwrite-server] getUserDatabases called without a JWT')
  }

  requireBaseEnv()

  const client = new Client()
    .setEndpoint(ENDPOINT!)
    .setProject(PROJECT_ID!)
    .setJWT(jwt)

  return new Databases(client)
}

// ─── Re-exports for legacy callers ──────────────────────────────────────────

export const DB_ID = APPWRITE_DB_ID
export const COLLECTIONS = COLLECTION_IDS

// ─── Subscription Document ───────────────────────────────────────────────────

export interface SubscriptionDoc {
  $id?: string
  userId: string
  // Stripe provider fields
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  // DodoPayments provider fields
  dodopaymentsCustomerId?: string
  dodopaymentsSubscriptionId?: string
  /** Which payment provider this subscription is with — 'stripe' | 'dodopayments' */
  provider?: string
  /** Canonical provider-agnostic customer id (legacy *CustomerId fields mirror this) */
  providerCustomerId?: string
  /** Canonical provider-agnostic subscription id (legacy *SubscriptionId fields mirror this) */
  providerSubscriptionId?: string
  status: string // 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired' | 'unpaid'
  plan: string   // 'monthly' | 'yearly'
  trialEnd?: number
  periodEnd?: number
  /** True if the user cancelled but still has access until periodEnd */
  cancelAtPeriodEnd?: boolean
  updatedAt: number
}

/**
 * Upsert a subscription document for a user. Admin-only — called by the
 * Stripe webhook (no user JWT available there).
 */
export async function upsertSubscription(
  userId: string,
  data: Omit<SubscriptionDoc, '$id' | 'userId'>
): Promise<void> {
  const db = getAdminDatabases()
  try {
    const existing = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
      Query.equal('userId', userId),
      Query.limit(1),
    ])

    if (existing.documents.length > 0) {
      await db.updateDocument(
        APPWRITE_DB_ID,
        COLLECTION_IDS.SUBSCRIPTIONS,
        existing.documents[0].$id,
        { ...data, userId }
      )
    } else {
      await db.createDocument(
        APPWRITE_DB_ID,
        COLLECTION_IDS.SUBSCRIPTIONS,
        ID.unique(),
        { ...data, userId }
      )
    }
  } catch (err) {
    console.error('[appwrite-server] upsertSubscription error:', err)
    throw err
  }
}

/**
 * Get a user's subscription document.
 *
 * Always reads via the ADMIN client. The `subscriptions` collection is
 * server-only (no client-readable permissions), and `userId` always originates
 * from a verified session (webhook metadata or `verifyAuth`), so an
 * admin read scoped by that `userId` never leaks another user's row. The `jwt`
 * parameter is accepted for backwards-compatibility with existing callers but
 * is intentionally ignored — a user-context read would return nothing against
 * the locked-down collection.
 *
 * @param userId  The user whose subscription to fetch
 * @param _jwt    Ignored (kept for signature compatibility — see above)
 */
export async function getSubscription(
  userId: string,
  _jwt?: string
): Promise<SubscriptionDoc | null> {
  const db = getAdminDatabases()
  try {
    const res = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
      Query.equal('userId', userId),
      Query.limit(1),
    ])
    if (res.documents.length === 0) return null
    return res.documents[0] as unknown as SubscriptionDoc
  } catch (err: any) {
    // 404 = collection or document not found → return null (never subscribed)
    if (err?.code === 404 || err?.response?.code === 404) return null
    // Everything else is a real DB error — let the caller handle it
    throw err
  }
}

/**
 * Look up a user by Stripe customer id. Admin-only — used by webhook
 * handlers when the Stripe event payload doesn't contain our metadata.userId
 * (e.g., subscriptions created from inside the customer portal).
 */
export async function getSubscriptionByCustomerId(customerId: string): Promise<SubscriptionDoc | null> {
  const db = getAdminDatabases()
  try {
    const res = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
      // Match either the legacy Stripe-specific field or the canonical
      // provider-agnostic field, so attribution works regardless of which
      // field a given row was written with.
      Query.or([
        Query.equal('stripeCustomerId', customerId),
        Query.equal('providerCustomerId', customerId),
      ]),
      Query.limit(1),
    ])
    if (res.documents.length === 0) return null
    return res.documents[0] as unknown as SubscriptionDoc
  } catch {
    return null
  }
}
/**
 * Look up a user by Dodo Payments customer id. Admin-only — used by webhook
 * handlers when the Dodo event payload doesn't contain our metadata.userId.
 */
export async function getSubscriptionByDodoCustomerId(customerId: string): Promise<SubscriptionDoc | null> {
  const db = getAdminDatabases()
  try {
    const res = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
      // Match either the legacy Dodo-specific field or the canonical
      // provider-agnostic field (see getSubscriptionByCustomerId).
      Query.or([
        Query.equal('dodopaymentsCustomerId', customerId),
        Query.equal('providerCustomerId', customerId),
      ]),
      Query.limit(1),
    ])
    if (res.documents.length === 0) return null
    return res.documents[0] as unknown as SubscriptionDoc
  } catch {
    return null
  }
}

/**
 * Merge new prefs into a user's Account Preferences. Admin-only — uses the
 * Users API which always requires the API key.
 */
export async function updateUserPrefs(
  userId: string,
  prefs: Record<string, any>
): Promise<void> {
  const u = getAdminUsers()
  const current = await u.getPrefs(userId)
  await u.updatePrefs(userId, { ...current, ...prefs })
}

// ─── Promo / referral code catalog (admin-only, read at checkout) ───────────

/** A promo/referral code catalog document (written by the admin dash). */
export interface PromoCodeDoc {
  $id?: string
  code: string
  type?: string
  value?: number
  stripeCouponId?: string
  stripePromotionCodeId?: string
  dodoDiscountId?: string
  appliesToPlans?: string[]
  maxRedemptions?: number
  redeemedCount?: number
  expiresAt?: number
  active?: boolean
  isReferral?: boolean
  referrerUserId?: string
  rewardType?: string
  rewardValue?: number
}

/**
 * Look up a promo/referral code in the catalog by its human code. Read-only —
 * the dash owns writes to this collection. Tries the code as given, then
 * upper-cased (providers uppercase codes). Returns `null` when not found or when
 * the collection is missing, so a checkout can always proceed without a promo.
 */
export async function getPromoCodeByCode(code: string): Promise<PromoCodeDoc | null> {
  const trimmed = (code ?? '').trim()
  if (!trimmed) return null
  const db = getAdminDatabases()
  const candidates = [...new Set([trimmed, trimmed.toUpperCase()])]
  try {
    for (const candidate of candidates) {
      const res = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.PROMO_CODES, [
        Query.equal('code', candidate),
        Query.limit(1),
      ])
      if (res.documents.length > 0) return res.documents[0] as unknown as PromoCodeDoc
    }
    return null
  } catch (err: any) {
    const c = err?.code ?? err?.response?.code
    if (c === 404) return null // collection not provisioned yet → no promo
    console.warn('[appwrite-server] getPromoCodeByCode failed:', err?.message)
    return null
  }
}

// ─── Promo / referral redemptions (admin-only) ──────────────────────────────
export interface PromoRedemptionEntry {
  /** 'stripe' | 'dodopayments' */
  provider: string
  /** Human-readable code the buyer redeemed (e.g. `SARAH10`), when resolvable. */
  code?: string
  /** Provider coupon id backing the code. */
  couponId?: string
  /** Provider promotion-code id (Stripe). */
  promotionCodeId?: string
  /** Referrer user id, when the code carries it in provider metadata. */
  referrerUserId?: string
  /** The buyer who redeemed the code and paid. */
  refereeUserId: string
  /** The buyer's email, for the dash report (best-effort). */
  refereeEmail?: string
  /** 'monthly' | 'yearly' */
  plan?: string
  /** Amount charged, in the currency's MINOR unit (e.g. cents). */
  amount?: number
  /** ISO 4217 currency code. */
  currency?: string
  /** Provider subscription id this redemption activated. */
  subscriptionId?: string
  /** epoch ms of the conversion. */
  convertedAt: number
}

/**
 * Record a promo/referral redemption at the moment a subscription first becomes
 * paid. `dedupeId` (typically `${provider}_${subscriptionId}`) is used as the
 * document id so re-deliveries of the same activation write the row exactly
 * once.
 *
 * Best-effort by design: a 409 (already recorded) or a missing collection is NOT
 * an error — promo/referral reporting must never block or fail a real activation.
 * Returns true only when a new row was written.
 */
export async function recordPromoRedemption(
  entry: PromoRedemptionEntry,
  dedupeId: string,
): Promise<boolean> {
  // Appwrite rejects undefined/null attribute values — persist only defined ones.
  const data = Object.fromEntries(
    Object.entries(entry).filter(([, v]) => v !== undefined && v !== null),
  )
  try {
    const db = getAdminDatabases()
    await db.createDocument(APPWRITE_DB_ID, COLLECTION_IDS.PROMO_REDEMPTIONS, dedupeId, data)
    return true
  } catch (err: any) {
    const code = err?.code ?? err?.response?.code
    if (code === 409) return false // already recorded — idempotent no-op
    if (code === 404) {
      console.warn(
        '[appwrite-server] promo_redemptions collection missing — redemption not recorded. ' +
          'Run `npm run db:setup`.',
      )
      return false
    }
    console.warn('[appwrite-server] recordPromoRedemption failed:', err?.message)
    return false
  }
}

// ─── Webhook Idempotency (admin-only) ───────────────────────────────────────

/**
 * Atomically claim a webhook event id, namespaced as `${provider}:${rawId}`.
 * Returns true on first sight, false on duplicates. Admin-only — the
 * `stripe_webhook_events` collection is server-only; users have no permissions
 * on it. The claim record is created with the collection's configured retention
 * (≥30 days) so replays beyond the retry window still de-duplicate.
 *
 * Availability contract (Requirement 8.9): a store failure (network error, 5xx,
 * or a MISSING collection) is re-thrown so the caller can return a non-2xx
 * response and let the provider retry — we must never silently treat an unknown
 * failure (or a misprovisioned store) as a successful claim and then mutate
 * state. A missing collection used to degrade open; it now fails CLOSED and is
 * also caught at boot by `assertRequiredCollections()`.
 */
export async function claimWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
  const db = getAdminDatabases()
  try {
    await db.createDocument(
      APPWRITE_DB_ID,
      COLLECTION_IDS.WEBHOOK_EVENTS,
      eventId,
      { eventId, eventType, processedAt: Date.now() }
    )
    return true
  } catch (err: any) {
    if (err?.code === 409 || err?.response?.code === 409) return false
    if (err?.code === 404 || err?.response?.code === 404) {
      // Fail CLOSED: the idempotency collection is missing. Returning "first
      // sight" here would silently disable replay protection and let provider
      // retries double-apply subscription state. Instead we surface it so the
      // webhook handler returns a non-2xx and the provider retries — and so the
      // boot-time `assertRequiredCollections()` check flags the misconfiguration
      // loudly at deploy rather than at the first paid webhook.
      console.error(
        `[appwrite-server] webhook events collection missing — failing CLOSED. ` +
        `Run \`npm run db:setup\` to create it.`
      )
      throw new Error('webhook_events_collection_missing')
    }
    // Transient store unavailability — surface it so the webhook handler returns
    // a non-2xx and the provider retries delivery (no state change in between).
    console.error('[appwrite-server] claimWebhookEvent error:', err)
    throw err
  }
}

/**
 * Verify that the server-only collections required for billing idempotency and
 * free-tier enforcement are provisioned. Intended to run once at server boot so
 * a missing collection is surfaced LOUDLY at deploy time instead of silently
 * failing closed on the first webhook / free-tier check in production.
 *
 * Best-effort by design: it returns the list of missing collection ids and logs
 * a prominent error, but never throws — a transient Appwrite blip at boot must
 * not take the whole app down, and the runtime paths (`claimWebhookEvent`,
 * `incrementFreeUsage`, `getFreeUsage`) already fail closed on their own.
 */
export async function assertRequiredCollections(): Promise<string[]> {
  const required: string[] = [
    COLLECTION_IDS.SUBSCRIPTIONS,
    COLLECTION_IDS.WEBHOOK_EVENTS,
    COLLECTION_IDS.FREE_USAGE,
  ]
  let db: Databases
  try {
    db = getAdminDatabases()
  } catch (e) {
    console.error(
      '[appwrite-server] cannot verify required collections (admin client unavailable):',
      (e as Error).message,
    )
    return required
  }

  const missing: string[] = []
  for (const id of required) {
    try {
      await db.listDocuments(APPWRITE_DB_ID, id, [Query.limit(1)])
    } catch (err: any) {
      if (err?.code === 404 || err?.response?.code === 404) {
        missing.push(id)
      } else {
        console.warn(`[appwrite-server] could not verify collection '${id}':`, err?.message)
      }
    }
  }

  if (missing.length > 0) {
    console.error(
      `[appwrite-server] ⚠️  MISSING required collections: ${missing.join(', ')}. ` +
      `Billing idempotency and free-tier enforcement will FAIL CLOSED until you run ` +
      `\`npm run db:setup\`.`,
    )
  } else {
    console.log(
      '[appwrite-server] ✓ required collections present (subscriptions, webhook events, free usage).',
    )
  }
  return missing
}

// ─── Free-tier lifetime usage (admin-only — server-only collection) ─────────

/**
 * Raised when the free-tier counter store cannot be read/written reliably
 * (missing collection, network error, 5xx). Callers MUST treat this as "cannot
 * verify remaining quota" and fail CLOSED (deny the free request) — never grant
 * free AI on an unverifiable counter, which would silently uncap the free tier.
 */
export class FreeUsageStoreError extends Error {
  constructor(message = 'free_usage_store_unavailable') {
    super(message)
    this.name = 'FreeUsageStoreError'
  }
}

/** True for "the document doesn't exist yet" (collection present, row absent). */
function isDocumentMissing(err: any): boolean {
  const code = err?.code ?? err?.response?.code
  return code === 404 && err?.type !== 'collection_not_found'
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Increment a user's LIFETIME free-tier message count and return the new total.
 * One document per user (doc id = userId) — the counter never resets.
 * Admin-only — the `free_tier_usage` collection is server-only so users
 * cannot tamper with their own counter.
 *
 * Fails CLOSED: any store failure (missing collection, network/5xx) throws a
 * `FreeUsageStoreError` rather than degrading to per-instance memory (which on a
 * restart / multi-instance deploy would reset the cap and hand out unlimited
 * free AI). The caller denies the request on this error.
 */
export async function incrementFreeUsage(userId: string): Promise<number> {
  const db = getAdminDatabases()
  const docId = userId

  try {
    const existing = await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId) as any
    const newCount = (existing.count ?? 0) + 1
    await db.updateDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId, { count: newCount })
    return newCount
  } catch (err: any) {
    // The row doesn't exist yet → create it as the user's first message.
    if (isDocumentMissing(err)) {
      try {
        await db.createDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId, {
          userId,
          date: todayKey(), // first-seen date (informational only)
          count: 1,
        })
        return 1
      } catch (createErr: any) {
        const cCode = createErr?.code ?? createErr?.response?.code
        // A concurrent create won the race — re-read and increment instead.
        if (cCode === 409) {
          try {
            const doc = await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId) as any
            const n = (doc.count ?? 0) + 1
            await db.updateDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId, { count: n })
            return n
          } catch (raceErr) {
            console.error('[appwrite-server] incrementFreeUsage race re-read failed:', raceErr)
            throw new FreeUsageStoreError()
          }
        }
        // Missing collection or any other create failure → fail closed.
        console.error('[appwrite-server] incrementFreeUsage create failed:', createErr)
        throw new FreeUsageStoreError()
      }
    }
    // Missing collection, network error, 5xx, etc. → fail closed.
    console.error('[appwrite-server] incrementFreeUsage error:', err)
    throw new FreeUsageStoreError()
  }
}

/**
 * Read a user's lifetime free-tier message count. A zero is returned ONLY when
 * the collection exists but the user's row does not (a genuine "never used"
 * state). Any store failure fails CLOSED via `FreeUsageStoreError` so we never
 * under-report usage and accidentally uncap the free tier.
 */
export async function getFreeUsage(userId: string): Promise<number> {
  const db = getAdminDatabases()
  const docId = userId
  try {
    const doc = await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId) as any
    return doc.count ?? 0
  } catch (err: any) {
    if (isDocumentMissing(err)) return 0
    console.error('[appwrite-server] getFreeUsage error:', err)
    throw new FreeUsageStoreError()
  }
}

// ─── Live-voice daily usage (admin-only — server-only collection) ───────────

/**
 * Read a user's live-voice seconds used for a given local day. doc id =
 * `${userId}_${dayKey}`.
 *
 * FAILS OPEN, deliberately — the OPPOSITE of the free-tier counter. This is a
 * fair-use ceiling on a PAYING user's premium feature: if the store can't be
 * read (missing collection, network blip), returning 0 lets the call proceed
 * rather than wrongly cutting off a customer mid-conversation. A rare over-serve
 * is far cheaper than a false denial + support ticket. The occurrence is logged
 * so persistent failures are visible.
 */
export async function getLiveUsageSeconds(userId: string, dayKey: string): Promise<number> {
  const db = getAdminDatabases()
  const docId = `${userId}_${dayKey}`
  try {
    const doc = (await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId)) as any
    return doc.secondsUsed ?? 0
  } catch (err: any) {
    if (isDocumentMissing(err)) return 0
    // Fail open: log and treat as "no usage recorded" so a paying user is never
    // wrongly blocked by a transient store error.
    console.warn('[appwrite-server] getLiveUsageSeconds failed (allowing):', err?.message)
    return 0
  }
}

/**
 * Add `deltaSeconds` to a user's live-voice usage for `dayKey`, returning the
 * new total (best-effort). Create-or-increment with a 409 race re-read, mirroring
 * `incrementFreeUsage` — but best-effort: a write failure is logged and swallowed
 * (returns a best-guess total) rather than thrown, because losing a few seconds
 * of metering must never interrupt a live call. `tier` is stored on first write
 * for analytics only.
 */
export async function addLiveUsageSeconds(
  userId: string,
  dayKey: string,
  deltaSeconds: number,
  tier?: string,
): Promise<number> {
  if (deltaSeconds <= 0) return getLiveUsageSeconds(userId, dayKey)
  const db = getAdminDatabases()
  const docId = `${userId}_${dayKey}`
  const delta = Math.round(deltaSeconds)
  try {
    const existing = (await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId)) as any
    const next = (existing.secondsUsed ?? 0) + delta
    await db.updateDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId, { secondsUsed: next })
    return next
  } catch (err: any) {
    if (isDocumentMissing(err)) {
      try {
        await db.createDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId, {
          userId,
          date: dayKey,
          secondsUsed: delta,
          ...(tier ? { tier } : {}),
        })
        return delta
      } catch (createErr: any) {
        const cCode = createErr?.code ?? createErr?.response?.code
        if (cCode === 409) {
          try {
            const doc = (await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId)) as any
            const n = (doc.secondsUsed ?? 0) + delta
            await db.updateDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId, { secondsUsed: n })
            return n
          } catch (raceErr: any) {
            console.warn('[appwrite-server] addLiveUsageSeconds race re-read failed:', raceErr?.message)
            return delta
          }
        }
        console.warn('[appwrite-server] addLiveUsageSeconds create failed:', createErr?.message)
        return delta
      }
    }
    console.warn('[appwrite-server] addLiveUsageSeconds error (best-effort):', err?.message)
    return delta
  }
}

// ─── Subscription Audit Log ─────────────────────────────────────────────────

export interface SubscriptionEventEntry {
  userId: string
  eventType: string
  stripeEventId: string
  subscriptionId?: string
  customerId?: string
  previousStatus?: string
  newStatus: string
  plan?: string
  timestamp: number
}

/**
 * Log a subscription state change to the audit collection.
 * Best-effort only — never throws or blocks the caller.
 */
export async function logSubscriptionEvent(entry: SubscriptionEventEntry): Promise<void> {
  try {
    const db = getAdminDatabases()
    await db.createDocument(
      APPWRITE_DB_ID,
      COLLECTION_IDS.SUBSCRIPTION_EVENTS,
      ID.unique(),
      entry
    )
  } catch (err: any) {
    if (err?.code === 404 || err?.response?.code === 404) {
      // Collection doesn't exist yet — silently skip
    } else {
      console.warn('[appwrite-server] logSubscriptionEvent failed:', err?.message)
    }
  }
}

// ─── Dead Letter Queue ───────────────────────────────────────────────────────

/**
 * Log a failed webhook event to the dead letter queue for manual inspection.
 * Best-effort only — never throws. Returns true if logged, false otherwise.
 */
export async function logDeadLetterEvent(
  eventId: string,
  eventType: string,
  errorMessage: string,
  rawBody?: string
): Promise<boolean> {
  try {
    const db = getAdminDatabases()
    await db.createDocument(
      APPWRITE_DB_ID,
      COLLECTION_IDS.WEBHOOK_DEAD_LETTER,
      ID.unique(),
      {
        eventId,
        eventType,
        error: errorMessage,
        rawBody: rawBody?.substring(0, 2000) ?? '',
        failedAt: Date.now(),
        resolved: false,
      }
    )
    return true
  } catch (err: any) {
    if (err?.code === 404 || err?.response?.code === 404) {
      console.warn('[appwrite-server] dead_letter collection missing — event lost:', eventId)
    } else {
      console.error('[appwrite-server] logDeadLetterEvent error:', err?.message)
    }
    return false
  }
}

// ─── Dead-letter replay support (admin / internal) ───────────────────────────

/** A stored `webhook_dead_letter` document, loaded by its Appwrite `$id`. */
export interface DeadLetterDoc {
  $id: string
  eventId: string
  eventType: string
  error?: string
  rawBody?: string
  failedAt?: number
  resolved?: boolean
}

/**
 * Load a single dead-letter document by its Appwrite document id. Returns
 * `null` when the document (or the collection) does not exist (404) so the
 * replay endpoint can answer 404 without throwing.
 */
export async function getDeadLetterEvent(id: string): Promise<DeadLetterDoc | null> {
  try {
    const db = getAdminDatabases()
    const doc = await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.WEBHOOK_DEAD_LETTER, id)
    return doc as unknown as DeadLetterDoc
  } catch (err: any) {
    if (err?.code === 404 || err?.response?.code === 404) return null
    throw err
  }
}

/**
 * Mark a dead-letter entry resolved (idempotent). Returns true on success,
 * false when the document/collection is missing (404).
 */
export async function markDeadLetterResolved(id: string): Promise<boolean> {
  try {
    const db = getAdminDatabases()
    await db.updateDocument(APPWRITE_DB_ID, COLLECTION_IDS.WEBHOOK_DEAD_LETTER, id, {
      resolved: true,
    })
    return true
  } catch (err: any) {
    if (err?.code === 404 || err?.response?.code === 404) return false
    throw err
  }
}
