/**
 * Idempotent Appwrite schema setup for the Talkingo web app.
 *
 * Run with:
 *   npm run db:setup
 *
 * Re-runs are safe: existing collections / attributes / indexes are skipped
 * with a warning, never deleted. Add new collections by appending another
 * `await ensureCollection(...)` call at the bottom of `main()`.
 *
 * Reads APPWRITE_API_KEY, NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID
 * from .env.local (loaded via Node's built-in --env-file flag in the npm script).
 */

import { Client, Databases, IndexType } from 'node-appwrite'

// ─── Connection ──────────────────────────────────────────────────────────────

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const API_KEY = process.env.APPWRITE_API_KEY

if (!PROJECT_ID || !API_KEY) {
  console.error(
    '\n❌ Missing env: NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY are required.\n' +
    '   Set them in .env.local before running this script.\n'
  )
  process.exit(1)
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
const databases = new Databases(client)

// Mirror the IDs from src/lib/appwrite-schema.ts. Kept in sync manually because
// this file is run via tsx outside the Next.js build, so importing from src/
// pulls in path-alias overhead we don't need here.
const DB_ID = 'talkingo_db'

const C = {
  USER_PREFERENCES: 'user_preferences',
  SUBSCRIPTIONS: 'subscriptions',
  WEBHOOK_EVENTS: 'stripe_webhook_events',
  SUBSCRIPTION_EVENTS: 'subscription_events',
  WEBHOOK_DEAD_LETTER: 'webhook_dead_letter',
  FREE_USAGE: 'free_tier_usage',
  LIVE_USAGE: 'live_usage_daily',
  ADMIN_AUDIT_LOG: 'admin_audit_log',
  PROMO_CODES: 'promo_codes',
  PROMO_REDEMPTIONS: 'promo_redemptions',
} as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AttrSpec =
  | { key: string; type: 'string'; size: number; required: boolean; array?: boolean; default?: string }
  | { key: string; type: 'integer'; required: boolean; array?: boolean; default?: number }
  | { key: string; type: 'double'; required: boolean; array?: boolean; default?: number }
  | { key: string; type: 'boolean'; required: boolean; array?: boolean; default?: boolean }

interface IndexSpec {
  key: string
  type: 'key' | 'unique' | 'fulltext'
  attributes: string[]
  orders?: ('ASC' | 'DESC')[]
}

interface CollectionSpec {
  id: string
  name: string
  /** Permissions array (Appwrite permission strings) */
  permissions: string[]
  /** Whether to auto-create document IDs vs. allow custom IDs */
  documentSecurity?: boolean
  attributes: AttrSpec[]
  indexes: IndexSpec[]
}

async function ensureDatabase() {
  try {
    await databases.get(DB_ID)
    log('•', `database ${DB_ID} exists`)
  } catch (err: any) {
    if (err?.code === 404) {
      await databases.create(DB_ID, 'Talkingo')
      log('+', `created database ${DB_ID}`)
    } else throw err
  }
}

async function ensureCollection(spec: CollectionSpec) {
  console.log(`\n━━━ ${spec.name} (${spec.id}) ━━━`)

  // 1. Collection
  try {
    await databases.getCollection(DB_ID, spec.id)
    log('•', 'collection exists')
    // Keep permissions + documentSecurity in sync on re-runs. createCollection
    // is skipped when the collection already exists, so without this an
    // existing collection would keep its OLD permissions forever (e.g. a
    // subscriptions collection stuck on the insecure `read("users")`).
    try {
      await databases.updateCollection(
        DB_ID,
        spec.id,
        spec.name,
        spec.permissions,
        spec.documentSecurity ?? false
      )
      log('•', 'permissions synced')
    } catch (err: any) {
      log('!', `permission sync failed: ${err?.message || err}`)
    }
  } catch (err: any) {
    if (err?.code !== 404) throw err
    await databases.createCollection(
      DB_ID,
      spec.id,
      spec.name,
      spec.permissions,
      spec.documentSecurity ?? false
    )
    log('+', 'collection created')
  }

  // 2. Attributes
  for (const a of spec.attributes) {
    try {
      if (a.type === 'string') {
        await databases.createStringAttribute(
          DB_ID, spec.id, a.key, a.size, a.required, a.default, a.array ?? false
        )
      } else if (a.type === 'integer') {
        await databases.createIntegerAttribute(
          DB_ID, spec.id, a.key, a.required, undefined, undefined, a.default, a.array ?? false
        )
      } else if (a.type === 'double') {
        await databases.createFloatAttribute(
          DB_ID, spec.id, a.key, a.required, undefined, undefined, a.default, a.array ?? false
        )
      } else if (a.type === 'boolean') {
        await databases.createBooleanAttribute(
          DB_ID, spec.id, a.key, a.required, a.default, a.array ?? false
        )
      }
      log('+', `attr ${a.key} (${a.type}${a.array ? '[]' : ''})`)
    } catch (err: any) {
      if (err?.code === 409) log('•', `attr ${a.key} exists`)
      else log('!', `attr ${a.key} failed: ${err?.message || err}`)
    }
  }

  // 3. Wait for attributes to be queryable before indexing
  if (spec.indexes.length > 0) {
    log('…', 'waiting 3s for attributes to settle')
    await sleep(3000)
  }

  // 4. Indexes
  for (const idx of spec.indexes) {
    try {
      await databases.createIndex(
        DB_ID, spec.id, idx.key, idx.type as IndexType, idx.attributes, idx.orders
      )
      log('+', `index ${idx.key} → [${idx.attributes.join(', ')}]`)
    } catch (err: any) {
      if (err?.code === 409) log('•', `index ${idx.key} exists`)
      else log('!', `index ${idx.key} failed: ${err?.message || err}`)
    }
  }
}

function log(symbol: string, msg: string) {
  const colors: Record<string, string> = { '+': '\x1b[32m', '•': '\x1b[90m', '!': '\x1b[31m', '…': '\x1b[36m' }
  const reset = '\x1b[0m'
  const color = colors[symbol] ?? ''
  console.log(`  ${color}${symbol}${reset} ${msg}`)
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ─── Permission presets ──────────────────────────────────────────────────────

/** Per-document owner-only access. Used for collections where each user owns their rows. */
const OWNER_ONLY = [
  'create("users")',
  'read("users")',
  'update("users")',
  'delete("users")',
]

/** Server-only collections — readable by users only via API routes (which run with API key). */
const SERVER_ONLY: string[] = []

// ─── Schema definitions ──────────────────────────────────────────────────────

const SCHEMAS: CollectionSpec[] = [
  // 1. User preferences (onboarding state mirror)
  {
    id: C.USER_PREFERENCES,
    name: 'User Preferences',
    permissions: OWNER_ONLY,
    documentSecurity: true,
    attributes: [
      { key: 'userId', type: 'string', size: 64, required: true },
      { key: 'userName', type: 'string', size: 128, required: false },
      { key: 'level', type: 'string', size: 32, required: true },
      { key: 'talkingoLevel', type: 'integer', required: false },
      { key: 'cefr', type: 'string', size: 4, required: false },
      { key: 'domainScores', type: 'string', size: 1024, required: false },
      { key: 'persona', type: 'string', size: 32, required: true },
      { key: 'targetLanguage', type: 'string', size: 8, required: false },
      { key: 'nativeLanguage', type: 'string', size: 16, required: false },
      { key: 'onboardingComplete', type: 'boolean', required: false },
      { key: 'currentUnitId', type: 'string', size: 128, required: false },
      { key: 'preferredScript', type: 'string', size: 16, required: false },
      { key: 'learnerGender', type: 'string', size: 16, required: false },
      { key: 'dialect', type: 'string', size: 8, required: false },
      { key: 'heritageMode', type: 'boolean', required: false },
      { key: 'uiLanguage', type: 'string', size: 8, required: false },
      { key: 'createdAt', type: 'integer', required: false },
      { key: 'updatedAt', type: 'integer', required: true },
      { key: 'memoryLifeline', type: 'string', size: 1024, required: false },
      { key: 'userNote', type: 'string', size: 1024, required: false },
      { key: 'pathProgress', type: 'string', size: 4096, required: false },
    ],
    indexes: [
      { key: 'idx_userId', type: 'key', attributes: ['userId'] },
    ],
  },

  // 2. Subscriptions (Stripe + DodoPayments)
  {
    id: C.SUBSCRIPTIONS,
    name: 'Subscriptions',
    // Server-only. The app NEVER reads this collection from the client SDK —
    // all reads go through `/api/billing/*` routes (admin context, scoped by
    // the authenticated userId). Collection-level `read("users")` previously
    // let any signed-in user query EVERY row (other people's customer ids,
    // plan, status). Server-only ([]) closes that hole; the API key bypasses
    // permissions for the server's own reads/writes.
    permissions: SERVER_ONLY,
    attributes: [
      { key: 'userId', type: 'string', size: 64, required: true },
      // Stripe provider fields
      { key: 'stripeCustomerId', type: 'string', size: 64, required: false },
      { key: 'stripeSubscriptionId', type: 'string', size: 64, required: false },
      // DodoPayments provider fields
      { key: 'dodopaymentsCustomerId', type: 'string', size: 64, required: false },
      { key: 'dodopaymentsSubscriptionId', type: 'string', size: 64, required: false },
      // Canonical provider-agnostic fields (legacy fields above are mirrored from these)
      { key: 'provider', type: 'string', size: 16, required: false },
      { key: 'providerCustomerId', type: 'string', size: 64, required: false },
      { key: 'providerSubscriptionId', type: 'string', size: 64, required: false },
      { key: 'status', type: 'string', size: 32, required: true },
      { key: 'plan', type: 'string', size: 16, required: true },
      { key: 'trialEnd', type: 'integer', required: false },
      { key: 'periodEnd', type: 'integer', required: false },
      { key: 'cancelAtPeriodEnd', type: 'boolean', required: false },
      { key: 'updatedAt', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'idx_userId', type: 'key', attributes: ['userId'] },
      { key: 'idx_stripeCustomerId', type: 'key', attributes: ['stripeCustomerId'] },
      { key: 'idx_dodopaymentsCustomerId', type: 'key', attributes: ['dodopaymentsCustomerId'] },
      { key: 'idx_provider', type: 'key', attributes: ['provider'] },
      { key: 'idx_providerCustomerId', type: 'key', attributes: ['providerCustomerId'] },
    ],
  },

  // 6. Stripe webhook events (idempotency log)
  {
    id: C.WEBHOOK_EVENTS,
    name: 'Stripe Webhook Events',
    // Server-only — written/read exclusively by the webhook route via API key
    permissions: SERVER_ONLY,
    attributes: [
      { key: 'eventId', type: 'string', size: 128, required: true },
      { key: 'eventType', type: 'string', size: 64, required: true },
      { key: 'processedAt', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'idx_eventType', type: 'key', attributes: ['eventType'] },
      { key: 'idx_processedAt', type: 'key', attributes: ['processedAt'], orders: ['DESC'] },
    ],
  },

  // 6b. Subscription state-change audit log (support & reconciliation).
  // Written by `logSubscriptionEvent` on every status transition. Server-only.
  {
    id: C.SUBSCRIPTION_EVENTS,
    name: 'Subscription Events',
    permissions: SERVER_ONLY,
    attributes: [
      { key: 'userId', type: 'string', size: 64, required: true },
      { key: 'eventType', type: 'string', size: 64, required: true },
      { key: 'stripeEventId', type: 'string', size: 128, required: true },
      { key: 'subscriptionId', type: 'string', size: 128, required: false },
      { key: 'customerId', type: 'string', size: 128, required: false },
      { key: 'previousStatus', type: 'string', size: 32, required: false },
      { key: 'newStatus', type: 'string', size: 32, required: true },
      { key: 'plan', type: 'string', size: 16, required: false },
      { key: 'timestamp', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'idx_userId', type: 'key', attributes: ['userId'] },
      { key: 'idx_timestamp', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
    ],
  },

  // 6c. Webhook dead-letter queue — events whose apply step failed/timed out.
  // Written by `logDeadLetterEvent` so a missed payment can be replayed instead
  // of being lost. Server-only.
  {
    id: C.WEBHOOK_DEAD_LETTER,
    name: 'Webhook Dead Letter',
    permissions: SERVER_ONLY,
    attributes: [
      { key: 'eventId', type: 'string', size: 128, required: true },
      { key: 'eventType', type: 'string', size: 64, required: true },
      { key: 'error', type: 'string', size: 2000, required: false },
      { key: 'rawBody', type: 'string', size: 4000, required: false },
      { key: 'failedAt', type: 'integer', required: true },
      { key: 'resolved', type: 'boolean', required: false },
    ],
    indexes: [
      { key: 'idx_eventId', type: 'key', attributes: ['eventId'] },
      { key: 'idx_resolved', type: 'key', attributes: ['resolved'] },
      { key: 'idx_failedAt', type: 'key', attributes: ['failedAt'], orders: ['DESC'] },
    ],
  },

  // 7. Free tier usage (lifetime counter — one doc per user, never resets)
  {
    id: C.FREE_USAGE,
    name: 'Free Tier Usage',
    // Server-only — written by the chat route via API key
    permissions: SERVER_ONLY,
    attributes: [
      { key: 'userId', type: 'string', size: 64, required: true },
      { key: 'date', type: 'string', size: 16, required: true },
      { key: 'count', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'idx_userId', type: 'key', attributes: ['userId'] },
      { key: 'idx_date', type: 'key', attributes: ['date'] },
    ],
  },

  // 8. Live-voice daily usage (per user-day counter — resets each local day).
  //    Server-only: written by the live proxy (admin key) as sessions stream;
  //    users must not be able to tamper with their own minutes. doc id =
  //    `${userId}_${localDate}`. `secondsUsed` accrues; there is no reset write —
  //    a new day is simply a new doc id.
  {
    id: C.LIVE_USAGE,
    name: 'Live Voice Daily Usage',
    permissions: SERVER_ONLY,
    attributes: [
      { key: 'userId', type: 'string', size: 64, required: true },
      { key: 'date', type: 'string', size: 16, required: true },
      { key: 'secondsUsed', type: 'integer', required: true },
      // Resolved cap tier at first write ('trial' | 'standard') — informational,
      // for analytics on who bumps their cap.
      { key: 'tier', type: 'string', size: 16, required: false },
    ],
    indexes: [
      { key: 'idx_userId', type: 'key', attributes: ['userId'] },
      { key: 'idx_date', type: 'key', attributes: ['date'] },
    ],
  },

  // 9. Admin action audit log — one row per admin mutation (support & compliance).
  // Written by `logAdminAction` from the dashboard admin routes. Server-only:
  // identity (adminId/adminEmail) is resolved server-side from verifyAdminAuth,
  // never trusted from the client body.
  {
    id: C.ADMIN_AUDIT_LOG,
    name: 'Admin Audit Log',
    permissions: SERVER_ONLY,
    attributes: [
      { key: 'adminId', type: 'string', size: 64, required: true },
      { key: 'adminEmail', type: 'string', size: 256, required: true },
      { key: 'action', type: 'string', size: 64, required: true },
      { key: 'targetType', type: 'string', size: 32, required: true },
      { key: 'targetId', type: 'string', size: 128, required: true },
      // JSON-serialized context (amount, reason, plan, etc.)
      { key: 'details', type: 'string', size: 4000, required: false },
      { key: 'timestamp', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'idx_timestamp', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
      { key: 'idx_action', type: 'key', attributes: ['action'] },
      { key: 'idx_targetType', type: 'key', attributes: ['targetType'] },
      { key: 'idx_adminEmail', type: 'key', attributes: ['adminEmail'] },
    ],
  },

  // 10. Promo / referral code catalog — managed by the admin dashboard.
  // One row per human code; a single row can carry both provider ids
  // (stripe + dodo) so the same code works on either checkout. `isReferral`
  // + `referrerUserId` mark a referral code (each referrer owns a unique one).
  // Server-only: the dashboard reads/writes via its admin key; the main app
  // may read it at checkout to validate a code.
  {
    id: C.PROMO_CODES,
    name: 'Promo Codes',
    permissions: SERVER_ONLY,
    attributes: [
      { key: 'code', type: 'string', size: 64, required: true },
      // 'percent' | 'fixed'
      { key: 'type', type: 'string', size: 16, required: true },
      { key: 'value', type: 'double', required: true },
      { key: 'stripeCouponId', type: 'string', size: 64, required: false },
      { key: 'stripePromotionCodeId', type: 'string', size: 64, required: false },
      { key: 'dodoDiscountId', type: 'string', size: 64, required: false },
      // e.g. ['monthly','yearly'] — empty/absent means all plans
      { key: 'appliesToPlans', type: 'string', size: 16, required: false, array: true },
      { key: 'maxRedemptions', type: 'integer', required: false },
      { key: 'redeemedCount', type: 'integer', required: false, default: 0 },
      { key: 'expiresAt', type: 'integer', required: false },
      { key: 'active', type: 'boolean', required: false, default: true },
      { key: 'isReferral', type: 'boolean', required: false, default: false },
      { key: 'referrerUserId', type: 'string', size: 64, required: false },
      // Referral reward config (what the referrer earns) — interpreted by the dash.
      { key: 'rewardType', type: 'string', size: 32, required: false },
      { key: 'rewardValue', type: 'double', required: false },
      { key: 'createdBy', type: 'string', size: 64, required: false },
      { key: 'createdAt', type: 'integer', required: false },
      { key: 'updatedAt', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'idx_code', type: 'unique', attributes: ['code'] },
      { key: 'idx_referrerUserId', type: 'key', attributes: ['referrerUserId'] },
      { key: 'idx_active', type: 'key', attributes: ['active'] },
      { key: 'idx_isReferral', type: 'key', attributes: ['isReferral'] },
    ],
  },

  // 11. Promo / referral redemption ledger — one row per PAID conversion.
  // Written by the webhook apply path (`recordPromoRedemption`) keyed on
  // `${provider}_${subscriptionId}` so re-deliveries record it exactly once.
  // The dashboard reads this to report referrals (who referred a paying user)
  // and promo usage. Server-only.
  {
    id: C.PROMO_REDEMPTIONS,
    name: 'Promo Redemptions',
    permissions: SERVER_ONLY,
    attributes: [
      { key: 'provider', type: 'string', size: 16, required: true },
      { key: 'code', type: 'string', size: 64, required: false },
      { key: 'couponId', type: 'string', size: 64, required: false },
      { key: 'promotionCodeId', type: 'string', size: 64, required: false },
      { key: 'referrerUserId', type: 'string', size: 64, required: false },
      { key: 'refereeUserId', type: 'string', size: 64, required: true },
      { key: 'refereeEmail', type: 'string', size: 256, required: false },
      { key: 'plan', type: 'string', size: 16, required: false },
      // Amount charged in the currency's MINOR unit (e.g. cents).
      { key: 'amount', type: 'integer', required: false },
      { key: 'currency', type: 'string', size: 8, required: false },
      { key: 'subscriptionId', type: 'string', size: 128, required: false },
      { key: 'convertedAt', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'idx_referrerUserId', type: 'key', attributes: ['referrerUserId'] },
      { key: 'idx_refereeUserId', type: 'key', attributes: ['refereeUserId'] },
      { key: 'idx_code', type: 'key', attributes: ['code'] },
      { key: 'idx_convertedAt', type: 'key', attributes: ['convertedAt'], orders: ['DESC'] },
    ],
  },
]

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Talkingo — Appwrite schema setup')
  console.log(`  endpoint: ${ENDPOINT}`)
  console.log(`  project:  ${PROJECT_ID}`)
  console.log(`  database: ${DB_ID}\n`)

  await ensureDatabase()

  for (const spec of SCHEMAS) {
    await ensureCollection(spec)
  }

  console.log('\n✅ Schema setup complete.\n')
  console.log('Notes:')
  console.log('  • Re-run anytime — existing collections/attrs/indexes are skipped.')
  console.log('  • Permissions are set per-collection. Tighten in Appwrite console if needed.\n')
}

main().catch(err => {
  console.error('\n❌ Fatal:', err?.message || err)
  process.exit(1)
})
