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
  stripeCustomerId: string
  stripeSubscriptionId?: string
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
 * @param userId  The user whose subscription to fetch
 * @param jwt     Optional user JWT. If provided, reads as the user (respects
 *                per-doc permissions). If omitted, reads as admin — only
 *                appropriate for webhook context where there's no user.
 */
export async function getSubscription(
  userId: string,
  jwt?: string
): Promise<SubscriptionDoc | null> {
  const db = jwt ? getUserDatabases(jwt) : getAdminDatabases()
  try {
    const res = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
      Query.equal('userId', userId),
      Query.limit(1),
    ])
    if (res.documents.length === 0) return null
    return res.documents[0] as unknown as SubscriptionDoc
  } catch {
    return null
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
      Query.equal('stripeCustomerId', customerId),
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

// ─── Webhook Idempotency (admin-only) ───────────────────────────────────────

/**
 * Atomically claim a Stripe webhook event id. Returns true on first sight,
 * false on duplicates. Admin-only — the `stripe_webhook_events` collection
 * is server-only; users have no permissions on it.
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
      console.warn(
        `[appwrite-server] webhook events collection missing — idempotency disabled. ` +
        `Run \`npm run db:setup\` to create it.`
      )
      return true
    }
    console.error('[appwrite-server] claimWebhookEvent error:', err)
    return true
  }
}

// ─── Free-tier daily usage (admin-only — server-only collection) ────────────

const inMemoryUsageFallback = new Map<string, { count: number; date: string }>()

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Increment a user's daily free-tier message count and return the new total.
 * Admin-only — the `free_tier_usage` collection is server-only so users
 * cannot tamper with their own counter.
 */
export async function incrementFreeUsage(userId: string): Promise<number> {
  const db = getAdminDatabases()
  const date = todayKey()
  const docId = `${userId}_${date}`

  try {
    try {
      const existing = await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId) as any
      const newCount = (existing.count ?? 0) + 1
      await db.updateDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId, { count: newCount })
      return newCount
    } catch (err: any) {
      if (err?.code === 404 || err?.response?.code === 404) {
        try {
          await db.createDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId, {
            userId,
            date,
            count: 1,
          })
          return 1
        } catch (createErr: any) {
          if (createErr?.code === 404 || createErr?.response?.code === 404) {
            return memoryFallbackIncrement(docId, date)
          }
          throw createErr
        }
      }
      throw err
    }
  } catch (err) {
    console.error('[appwrite-server] incrementFreeUsage error:', err)
    return memoryFallbackIncrement(docId, date)
  }
}

export async function getFreeUsage(userId: string): Promise<number> {
  const db = getAdminDatabases()
  const date = todayKey()
  const docId = `${userId}_${date}`
  try {
    const doc = await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.FREE_USAGE, docId) as any
    return doc.count ?? 0
  } catch (err: any) {
    if (err?.code === 404 || err?.response?.code === 404) {
      return memoryFallbackGet(docId, date)
    }
    return 0
  }
}

function memoryFallbackIncrement(key: string, date: string): number {
  const entry = inMemoryUsageFallback.get(key)
  if (!entry || entry.date !== date) {
    inMemoryUsageFallback.set(key, { count: 1, date })
    return 1
  }
  entry.count++
  return entry.count
}

function memoryFallbackGet(key: string, date: string): number {
  const entry = inMemoryUsageFallback.get(key)
  if (!entry || entry.date !== date) return 0
  return entry.count
}
