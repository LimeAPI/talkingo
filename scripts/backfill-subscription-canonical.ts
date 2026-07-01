/**
 * Idempotent backfill of canonical provider-agnostic subscription fields.
 *
 * Run with:
 *   npm run db:backfill-subscriptions
 *
 * What it does:
 *   Pages through every document in the `subscriptions` collection, computes
 *   the canonical snapshot via `toUnified` (canonical-first, legacy-fallback),
 *   and writes the canonical fields (`provider`, `providerCustomerId`,
 *   `providerSubscriptionId`, plus mirrored legacy fields) back via
 *   `toDocFields`.
 *
 * Safe to re-run:
 *   - Documents where `toUnified` returns null (unknown provider, or no
 *     provider and no legacy customer id) are skipped.
 *   - A document is only written when a canonical field is missing or differs
 *     from the value the mapper would produce. A second run is a pure no-op.
 *   - `updatedAt` is preserved (the mapper derives it from the stored doc), so
 *     the backfill never disturbs race-safe write ordering.
 *
 * Reads APPWRITE_API_KEY, NEXT_PUBLIC_APPWRITE_ENDPOINT,
 * NEXT_PUBLIC_APPWRITE_PROJECT_ID from .env.local (loaded via Node's built-in
 * --env-file flag in the npm script).
 */

import { Client, Databases, Query } from 'node-appwrite'
import { APPWRITE_DB_ID, COLLECTION_IDS } from '../src/lib/appwrite-schema'
import { toUnified, toDocFields } from '../src/lib/payments/subscription-mapper'
import type { SubscriptionDoc } from '../src/lib/appwrite-server'

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

const PAGE_SIZE = 100

// ─── Logging (mirrors setup-appwrite-schema.ts) ──────────────────────────────

function log(symbol: string, msg: string) {
  const colors: Record<string, string> = {
    '+': '\x1b[32m', // green  — wrote
    '•': '\x1b[90m', // grey   — already canonical / info
    '~': '\x1b[33m', // yellow — skipped (unmappable)
    '!': '\x1b[31m', // red    — error
    '…': '\x1b[36m', // cyan   — progress
  }
  const reset = '\x1b[0m'
  const color = colors[symbol] ?? ''
  console.log(`  ${color}${symbol}${reset} ${msg}`)
}

// ─── Diff: which canonical fields need writing? ──────────────────────────────

/**
 * Build the minimal set of fields to write so the document matches what the
 * mapper would produce. Returns an empty object when the document is already
 * canonical (→ the caller skips the write, keeping the run idempotent).
 *
 * Only defined values that differ from the stored value are included, so the
 * backfill never clears an existing field by writing `undefined`.
 */
function computeUpdate(
  existing: SubscriptionDoc,
  desired: Partial<SubscriptionDoc>
): Partial<SubscriptionDoc> {
  const update: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(desired)) {
    if (value === undefined) continue
    if ((existing as Record<string, unknown>)[key] !== value) {
      update[key] = value
    }
  }
  return update as Partial<SubscriptionDoc>
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface Tally {
  scanned: number
  written: number
  alreadyCanonical: number
  skipped: number
  errors: number
}

async function main() {
  console.log('Talkingo — subscription canonical-field backfill')
  console.log(`  endpoint: ${ENDPOINT}`)
  console.log(`  project:  ${PROJECT_ID}`)
  console.log(`  database: ${APPWRITE_DB_ID}`)
  console.log(`  collection: ${COLLECTION_IDS.SUBSCRIPTIONS}\n`)

  const tally: Tally = { scanned: 0, written: 0, alreadyCanonical: 0, skipped: 0, errors: 0 }
  let cursor: string | undefined

  // Page through the entire collection with cursor pagination.
  for (;;) {
    const queries = [Query.limit(PAGE_SIZE)]
    if (cursor) queries.push(Query.cursorAfter(cursor))

    const page = await databases.listDocuments(
      APPWRITE_DB_ID,
      COLLECTION_IDS.SUBSCRIPTIONS,
      queries
    )

    if (page.documents.length === 0) break

    for (const raw of page.documents) {
      const doc = raw as unknown as SubscriptionDoc
      tally.scanned++

      try {
        const unified = toUnified(doc)
        if (!unified) {
          tally.skipped++
          log('~', `${doc.$id} skipped — unmappable (unknown provider / no customer id)`)
          continue
        }

        const desired = toDocFields(unified)
        const update = computeUpdate(doc, desired)

        if (Object.keys(update).length === 0) {
          tally.alreadyCanonical++
          log('•', `${doc.$id} already canonical (provider=${unified.provider})`)
          continue
        }

        await databases.updateDocument(
          APPWRITE_DB_ID,
          COLLECTION_IDS.SUBSCRIPTIONS,
          doc.$id!,
          update
        )
        tally.written++
        log('+', `${doc.$id} backfilled [${Object.keys(update).join(', ')}]`)
      } catch (err: any) {
        tally.errors++
        log('!', `${doc.$id} failed: ${err?.message || err}`)
      }
    }

    // Advance the cursor; stop when the last page was short.
    cursor = page.documents[page.documents.length - 1].$id
    if (page.documents.length < PAGE_SIZE) break
    log('…', `scanned ${tally.scanned} so far…`)
  }

  console.log('\n✅ Backfill complete.')
  console.log(`  scanned:           ${tally.scanned}`)
  console.log(`  written:           ${tally.written}`)
  console.log(`  already canonical: ${tally.alreadyCanonical}`)
  console.log(`  skipped:           ${tally.skipped}`)
  console.log(`  errors:            ${tally.errors}\n`)

  if (tally.errors > 0) process.exitCode = 1
}

main().catch(err => {
  console.error('\n❌ Fatal:', err?.message || err)
  process.exit(1)
})
