/**
 * Server-side Appwrite client for the web app.
 * Used in API routes (webhook, etc.) to update user data with admin privileges.
 */

import { Client, Databases, Users, Query, ID } from 'node-appwrite'

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!)

export const databases = new Databases(client)
export const users = new Users(client)

export const DB_ID = 'talkingo_db'

export const COLLECTIONS = {
  USER_PREFERENCES: 'user_preferences',
  LANGUAGE_PROGRESS: 'language_progress',
  SESSION_ANALYTICS: 'session_analytics',
  SUBSCRIPTIONS: 'subscriptions',
} as const

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
  updatedAt: number
}

/**
 * Upsert a subscription document for a user.
 * Creates if not exists, updates if exists.
 */
export async function upsertSubscription(
  userId: string,
  data: Omit<SubscriptionDoc, '$id' | 'userId'>
): Promise<void> {
  try {
    // Try to find existing subscription doc for this user
    const existing = await databases.listDocuments(DB_ID, COLLECTIONS.SUBSCRIPTIONS, [
      Query.equal('userId', userId),
      Query.limit(1),
    ])

    if (existing.documents.length > 0) {
      // Update existing
      await databases.updateDocument(
        DB_ID,
        COLLECTIONS.SUBSCRIPTIONS,
        existing.documents[0].$id,
        { ...data, userId }
      )
    } else {
      // Create new
      await databases.createDocument(
        DB_ID,
        COLLECTIONS.SUBSCRIPTIONS,
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
 */
export async function getSubscription(userId: string): Promise<SubscriptionDoc | null> {
  try {
    const res = await databases.listDocuments(DB_ID, COLLECTIONS.SUBSCRIPTIONS, [
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
 * Update a user's Account Preferences (merge, not replace).
 * Still used for onboarding state — subscription data now lives in the subscriptions collection.
 */
export async function updateUserPrefs(
  userId: string,
  prefs: Record<string, any>
): Promise<void> {
  const current = await users.getPrefs(userId)
  await users.updatePrefs(userId, { ...current, ...prefs })
}
