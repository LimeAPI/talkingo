/**
 * Single source of truth for Appwrite database & collection IDs.
 *
 * Whenever you add a new collection in code, declare it here AND add a
 * matching block to scripts/setup-appwrite-schema.ts so the schema can be
 * provisioned with `npm run db:setup`.
 *
 * Don't hardcode collection IDs in route files — import them from here.
 */

export const APPWRITE_DB_ID = 'talkingo_db'

export const COLLECTION_IDS = {
  /** Onboarding state mirror (level, persona, target/native lang, goal) */
  USER_PREFERENCES: 'user_preferences',
  /** Stripe subscription state (one doc per user) */
  SUBSCRIPTIONS: 'subscriptions',
  /** Stripe webhook idempotency log (doc id = stripe event id) */
  WEBHOOK_EVENTS: 'stripe_webhook_events',
  /** Subscription state change audit log (for support & reconciliation) */
  SUBSCRIPTION_EVENTS: 'subscription_events',
  /** Free-tier lifetime message counter (doc id = `${userId}`) */
  FREE_USAGE: 'free_tier_usage',
  /** Live-voice daily usage counter (doc id = `${userId}_${localDate}`) — resets per user-day */
  LIVE_USAGE: 'live_usage_daily',
  /** Webhook events that failed processing — for manual replay & monitoring */
  WEBHOOK_DEAD_LETTER: 'webhook_dead_letter',
  /** Admin action audit log (one row per admin mutation — support & compliance) */
  ADMIN_AUDIT_LOG: 'admin_audit_log',
  /** Promo/discount + referral code catalog (managed by the admin dash) */
  PROMO_CODES: 'promo_codes',
  /** Promo/referral redemption ledger — one row per paid conversion (written by the webhook) */
  PROMO_REDEMPTIONS: 'promo_redemptions',
} as const

export type CollectionId = (typeof COLLECTION_IDS)[keyof typeof COLLECTION_IDS]
