/**
 * DEV-ONLY data reset for the Talkingo web app.
 *
 * Wipes the per-user billing/subscription state that was written against the
 * OLD Stripe / DodoPayments accounts so every user starts fresh. Subscription
 * state lives in TWO places and BOTH are cleared:
 *
 *   1. Appwrite collections in `talkingo_db`:
 *        subscriptions, subscription_events, stripe_webhook_events,
 *        webhook_dead_letter, free_tier_usage
 *      (optionally user_preferences with --onboarding)
 *
 *   2. Each auth user's Account Prefs (stamped by syncSubscriptionToAppwrite /
 *      syncToAppwrite): stripeCustomerId, dodopaymentsCustomerId,
 *      dodopaymentsSubscriptionId, providerCustomerId, subscriptionStatus,
 *      subscriptionPlan, subscriptionTrialEnd, subscriptionPeriodEnd,
 *      subscriptionUpdatedAt
 *
 * Run with (from apps/talkingo.ai):
 *   # preview only (no changes):
 *   node --env-file=.env.local --import tsx scripts/reset-dev-data.ts
 *
 *   # actually wipe billing data + subscription prefs (destructive runs MUST
 *   # name the project to confirm it isn't production):
 *   node --env-file=.env.local --import tsx scripts/reset-dev-data.ts --yes --confirm-project=<PROJECT_ID>
 *
 *   # also wipe onboarding (user_preferences):
 *   node --env-file=.env.local --import tsx scripts/reset-dev-data.ts --yes --confirm-project=<PROJECT_ID> --onboarding
 *
 *   # nuke EVERYTHING incl. deleting all auth accounts (blank slate):
 *   node --env-file=.env.local --import tsx scripts/reset-dev-data.ts --yes --confirm-project=<PROJECT_ID> --purge-users
 *
 *   # also clear ALL prefs (not just subscription keys) on each user:
 *   node --env-file=.env.local --import tsx scripts/reset-dev-data.ts --yes --confirm-project=<PROJECT_ID> --clear-all-prefs
 */

import { Client, Databases, Users, Query } from 'node-appwrite'

// ─── Connection ──────────────────────────────────────────────────────────────

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const API_KEY = process.env.APPWRITE_API_KEY

if (!PROJECT_ID || !API_KEY) {
  console.error(
    '\n❌ Missing env: NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY are required.\n' +
    '   Set them in apps/talkingo.ai/.env.local before running this script.\n'
  )
  process.exit(1)
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
const databases = new Databases(client)
const users = new Users(client)

const DB_ID = 'talkingo_db'

// ─── Flags ───────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const APPLY = argv.includes('--yes')
const WIPE_ONBOARDING = argv.includes('--onboarding')
const PURGE_USERS = argv.includes('--purge-users')
const CLEAR_ALL_PREFS = argv.includes('--clear-all-prefs')

// ─── Destructive-action guard ────────────────────────────────────────────────
// Dry-run is always safe. But `--yes` permanently deletes data from whichever
// Appwrite project `.env.local` points at — which could be PRODUCTION if the
// file was copied/misconfigured. To make an accidental prod wipe effectively
// impossible, an APPLY run must ALSO pass `--confirm-project=<PROJECT_ID>` whose
// value exactly matches the resolved project id. This forces the operator to
// consciously name the project they are about to wipe (the same pattern GitHub
// uses for "type the repo name to delete").
const confirmFlag = argv.find((a) => a.startsWith('--confirm-project='))
const confirmedProject = confirmFlag ? confirmFlag.split('=').slice(1).join('=') : null

if (APPLY && confirmedProject !== PROJECT_ID) {
  console.error(
    '\n❌ Refusing to run a destructive reset without explicit project confirmation.\n' +
    `   This would permanently delete data from project:  ${PROJECT_ID}\n` +
    `   Re-run with:  --yes --confirm-project=${PROJECT_ID}\n` +
    (confirmedProject
      ? `   (you passed --confirm-project=${confirmedProject}, which does not match)\n`
      : '') +
    '   Tip: double-check NEXT_PUBLIC_APPWRITE_PROJECT_ID in .env.local is NOT production.\n'
  )
  process.exit(1)
}

// Narrow scope: only clear the `subscriptions` collection (skip free_tier_usage,
// audit/webhook logs). Subscription prefs are still stripped from affected users,
// so the only users touched are those who actually had a subscription — turning
// them back into fresh free users without disturbing anyone else's data.
const SUBSCRIPTIONS_ONLY = argv.includes('--subscriptions-only')

// Collections whose documents we always clear (per-user billing/usage state).
const BILLING_COLLECTIONS = SUBSCRIPTIONS_ONLY
  ? ['subscriptions']
  : [
      'subscriptions',
      'subscription_events',
      'stripe_webhook_events',
      'webhook_dead_letter',
      'free_tier_usage',
    ]

// Subscription-related prefs keys written by the sync layer.
const SUBSCRIPTION_PREF_KEYS = [
  'stripeCustomerId',
  'dodopaymentsCustomerId',
  'dodopaymentsSubscriptionId',
  'providerCustomerId',
  'subscriptionStatus',
  'subscriptionPlan',
  'subscriptionTrialEnd',
  'subscriptionPeriodEnd',
  'subscriptionUpdatedAt',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAGE = 100

function log(symbol: string, msg: string) {
  const colors: Record<string, string> = { '+': '\x1b[32m', '•': '\x1b[90m', '!': '\x1b[31m', '…': '\x1b[36m' }
  const reset = '\x1b[0m'
  console.log(`  ${colors[symbol] ?? ''}${symbol}${reset} ${msg}`)
}

/** Delete every document in a collection using cursor pagination. Returns count deleted (or that would be deleted in dry-run). */
async function clearCollection(collectionId: string): Promise<number> {
  console.log(`\n━━━ ${collectionId} ━━━`)
  let total = 0
  let cursor: string | undefined

  // First, a count probe.
  try {
    const probe = await databases.listDocuments(DB_ID, collectionId, [Query.limit(1)])
    if (probe.total === 0) {
      log('•', 'already empty')
      return 0
    }
    log('…', `${probe.total} document(s) found`)
  } catch (err: any) {
    if (err?.code === 404) {
      log('•', 'collection does not exist — skipping')
      return 0
    }
    throw err
  }

  // Page through and delete.
  // We always start from the beginning each loop because deletes shift the set;
  // using a fresh listDocuments(limit) without cursor is simplest and correct.
  while (true) {
    const queries = [Query.limit(PAGE)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await databases.listDocuments(DB_ID, collectionId, queries)
    if (page.documents.length === 0) break

    for (const doc of page.documents) {
      if (APPLY) {
        try {
          await databases.deleteDocument(DB_ID, collectionId, doc.$id)
        } catch (err: any) {
          log('!', `failed to delete ${doc.$id}: ${err?.message || err}`)
          continue
        }
      }
      total++
    }

    if (APPLY) {
      // Documents are gone, so re-query from the start (no cursor).
      cursor = undefined
      // Stop when nothing is left.
      const remaining = await databases.listDocuments(DB_ID, collectionId, [Query.limit(1)])
      if (remaining.total === 0) break
    } else {
      // Dry-run: page forward so we count the full set without deleting.
      cursor = page.documents[page.documents.length - 1].$id
      if (page.documents.length < PAGE) break
    }
  }

  log(APPLY ? '+' : '•', `${APPLY ? 'deleted' : 'would delete'} ${total} document(s)`)
  return total
}

/** Strip subscription prefs (or all prefs) from every auth user, or delete users entirely. */
async function processUsers(): Promise<{ scanned: number; changed: number }> {
  console.log(`\n━━━ auth users ${PURGE_USERS ? '(PURGE)' : '(clear prefs)'} ━━━`)
  let scanned = 0
  let changed = 0
  let cursor: string | undefined

  while (true) {
    const queries = [Query.limit(PAGE)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await users.list(queries)
    if (page.users.length === 0) break

    for (const u of page.users) {
      scanned++

      if (PURGE_USERS) {
        if (APPLY) {
          try {
            await users.delete(u.$id)
          } catch (err: any) {
            log('!', `failed to delete user ${u.$id}: ${err?.message || err}`)
            continue
          }
        }
        changed++
        continue
      }

      // Clear prefs path.
      const current = (u.prefs ?? {}) as Record<string, unknown>
      let nextPrefs: Record<string, unknown>
      if (CLEAR_ALL_PREFS) {
        nextPrefs = {}
      } else {
        nextPrefs = { ...current }
        for (const k of SUBSCRIPTION_PREF_KEYS) delete nextPrefs[k]
      }

      const hadSubKeys = CLEAR_ALL_PREFS
        ? Object.keys(current).length > 0
        : SUBSCRIPTION_PREF_KEYS.some((k) => k in current)

      if (!hadSubKeys) continue // nothing to change for this user

      if (APPLY) {
        try {
          await users.updatePrefs(u.$id, nextPrefs)
        } catch (err: any) {
          log('!', `failed to update prefs for ${u.$id}: ${err?.message || err}`)
          continue
        }
      }
      log(APPLY ? '+' : '•', `${APPLY ? 'cleared' : 'would clear'} prefs for ${u.email || u.name || u.$id}`)
      changed++
    }

    if (PURGE_USERS && APPLY) {
      cursor = undefined
      const remaining = await users.list([Query.limit(1)])
      if (remaining.total === 0) break
    } else {
      cursor = page.users[page.users.length - 1].$id
      if (page.users.length < PAGE) break
    }
  }

  const verb = PURGE_USERS
    ? (APPLY ? 'deleted' : 'would delete')
    : (APPLY ? 'updated' : 'would update')
  log(APPLY ? '+' : '•', `scanned ${scanned} user(s); ${verb} ${changed}`)
  return { scanned, changed }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Talkingo — DEV data reset')
  console.log(`  endpoint: ${ENDPOINT}`)
  console.log(`  project:  ${PROJECT_ID}`)
  console.log(`  database: ${DB_ID}`)
  console.log(`  mode:     ${APPLY ? '\x1b[31mAPPLY (destructive)\x1b[0m' : 'DRY-RUN (no changes)'}`)
  console.log(`  scope:    billing collections${WIPE_ONBOARDING ? ' + user_preferences' : ''}` +
    `${PURGE_USERS ? ' + DELETE all auth users' : (CLEAR_ALL_PREFS ? ' + clear ALL user prefs' : ' + clear subscription prefs')}\n`)

  const collections = [...BILLING_COLLECTIONS]
  if (WIPE_ONBOARDING) collections.push('user_preferences')

  let docTotal = 0
  for (const c of collections) {
    docTotal += await clearCollection(c)
  }

  const userResult = await processUsers()

  console.log('\n────────────────────────────────────────')
  if (APPLY) {
    console.log(`✅ Done. Removed ${docTotal} document(s); ${PURGE_USERS ? 'deleted' : 'updated'} ${userResult.changed} user(s).`)
  } else {
    console.log(`Dry-run complete. Would remove ${docTotal} document(s) and affect ${userResult.changed}/${userResult.scanned} user(s).`)
    console.log('Re-run with --yes to apply.')
  }
  console.log('')
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err?.message || err)
  process.exit(1)
})
