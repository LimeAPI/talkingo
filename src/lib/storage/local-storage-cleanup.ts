/**
 * localStorage cleanup utilities.
 *
 * Removes obsolete keys from prior versions of the app and reports
 * current usage. Runs once on app initialization.
 */

const OBSOLETE_KEY_PREFIXES = [
  'talkingo_progress_',          // old language_progress cache
  'talkingo_memory_',            // old character_memory cache
  'talkingo_phrase_bank_',       // old phrase bank
  'talkingo_phrases_',           // old phrase bank (alt key)
  'talkingo_session_recaps_',    // old session recaps
  'talkingo_conversations_',     // old conversation transcripts
  'talkingo_chat_history_',      // old chat history
  'talkingo_pending_sync',       // old offline sync queue
]

const OBSOLETE_EXACT_KEYS = [
  'talkingo_conversation_memory',
]

/**
 * Master cleanup function — removes obsolete keys from older versions.
 * Safe to run on every app initialization.
 */
export function performLocalStorageCleanup(): void {
  try {
    const removedKeys: string[] = []

    // Collect keys to remove (can't modify during iteration)
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue

      // Exact matches
      if (OBSOLETE_EXACT_KEYS.includes(key)) {
        keysToRemove.push(key)
        continue
      }

      // Prefix matches
      for (const prefix of OBSOLETE_KEY_PREFIXES) {
        if (key.startsWith(prefix)) {
          keysToRemove.push(key)
          break
        }
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key)
      removedKeys.push(key)
    }

    if (removedKeys.length > 0) {
      console.log(`[Cleanup] Removed ${removedKeys.length} obsolete localStorage keys`)
    }

    // Log current usage
    let totalSize = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('talkingo_')) {
        const value = localStorage.getItem(key)
        totalSize += (key.length + (value?.length ?? 0)) * 2
      }
    }

    const sizeKB = (totalSize / 1024).toFixed(2)
    console.log(`[Cleanup] Talkingo localStorage usage: ${sizeKB} KB`)
  } catch (error) {
    console.warn('[Cleanup] Failed:', error)
  }
}
