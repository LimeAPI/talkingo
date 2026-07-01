/**
 * One-off cleanup — permanently remove the legacy `system_config` collection
 * (and its `master_prompt` document) from Appwrite.
 *
 * The DB-backed "master prompt" feature was fully removed from the codebase; the
 * app now runs solely on the static MASTER_PROMPT constant. This script deletes
 * the leftover data so it can never reappear in the admin UI again.
 *
 * What it does (in order):
 *   1. Deletes every document in the `system_config` collection (the
 *      `master_prompt` row and anything else that accumulated there).
 *   2. Deletes the `system_config` collection itself.
 *
 * Safety: DRY-RUN by default — it only PRINTS what it would do. An APPLY run is
 * destructive and must ALSO name the project (same guard as reset-dev-data) so
 * an accidental prod wipe is effectively impossible.
 *
 * Run with (from apps/talkingo.ai):
 *   # preview only (no changes):
 *   node --env-file=.env.local --import tsx scripts/remove-system-config.ts
 *
 *   # actually delete:
 *   node --env-file=.env.local --import tsx scripts/remove-system-config.ts --yes --confirm-project=<PROJECT_ID>
 *
 * This script is idempotent: re-running after a successful APPLY is a no-op
 * (the collection is already gone).
 */

import { Client, Databases, Query } from 'node-appwrite'

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

const DB_ID = 'talkingo_db'
const COLLECTION_ID = 'system_config'

// ─── Flags / destructive-action guard ─────────────────────────────────────────

const argv = process.argv.slice(2)
const APPLY = argv.includes('--yes')
const confirmFlag = argv.find((a) => a.startsWith('--confirm-project='))
const confirmedProject = confirmFlag ? confirmFlag.split('=').slice(1).join('=') : null

if (APPLY && confirmedProject !== PROJECT_ID) {
  console.error(
    '\n❌ Refusing to run a destructive cleanup without explicit project confirmation.\n' +
    `   This would permanently delete the "${COLLECTION_ID}" collection from project:  ${PROJECT_ID}\n` +
    `   Re-run with:  --yes --confirm-project=${PROJECT_ID}\n` +
    (confirmedProject
      ? `   (you passed --confirm-project=${confirmedProject}, which does not match)\n`
      : '') +
    '   Tip: double-check NEXT_PUBLIC_APPWRITE_PROJECT_ID in .env.local is NOT production.\n'
  )
  process.exit(1)
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Talkingo — remove legacy system_config\n')
  console.log(`  endpoint:   ${ENDPOINT}`)
  console.log(`  project:    ${PROJECT_ID}`)
  console.log(`  database:   ${DB_ID}`)
  console.log(`  collection: ${COLLECTION_ID}`)
  console.log(`  mode:       ${APPLY ? '\x1b[31mAPPLY (destructive)\x1b[0m' : 'DRY-RUN (no changes)'}\n`)

  // 1. Enumerate + delete every document (paged).
  let docCount = 0
  let collectionMissing = false
  try {
    // Page through in batches so a large collection is fully cleared.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await databases.listDocuments(DB_ID, COLLECTION_ID, [Query.limit(100)])
      if (res.documents.length === 0) break

      for (const doc of res.documents) {
        const key = (doc as { key?: string }).key ?? '(no key)'
        if (APPLY) {
          await databases.deleteDocument(DB_ID, COLLECTION_ID, doc.$id)
          console.log(`  • deleted document  key="${key}"  ($id=${doc.$id})`)
        } else {
          console.log(`  • would delete document  key="${key}"  ($id=${doc.$id})`)
        }
        docCount++
      }

      // In dry-run there are no deletions, so a second page would loop forever.
      if (!APPLY) break
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/could not be found|not found/i.test(msg)) {
      collectionMissing = true
      console.log('  • collection not found — already removed. Nothing to do.')
    } else {
      console.error('\n❌ Failed while listing/deleting documents:', msg)
      process.exit(1)
    }
  }

  // 2. Delete the collection itself.
  if (!collectionMissing) {
    if (APPLY) {
      try {
        await databases.deleteCollection(DB_ID, COLLECTION_ID)
        console.log(`  • deleted collection "${COLLECTION_ID}"`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/could not be found|not found/i.test(msg)) {
          console.log('  • collection already gone.')
        } else {
          console.error('\n❌ Failed while deleting the collection:', msg)
          process.exit(1)
        }
      }
    } else {
      console.log(`  • would delete collection "${COLLECTION_ID}"`)
    }
  }

  console.log(
    `\n${APPLY ? '✅ Done.' : 'ℹ️  Dry-run complete — no changes made.'} ` +
    `Documents ${APPLY ? 'deleted' : 'found'}: ${docCount}.\n` +
    (APPLY ? '' : '   Re-run with --yes --confirm-project=<PROJECT_ID> to apply.\n')
  )
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err?.message || err)
  process.exit(1)
})
