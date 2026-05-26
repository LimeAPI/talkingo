/**
 * localStorage cleanup utilities to prevent quota issues.
 * 
 * Automatically removes old/unused data to keep localStorage under control.
 * Run on app initialization and periodically during idle times.
 */

import type { TargetLanguage } from '@talkingo/shared/types'

const MAX_SESSION_RECAPS = 10
const MAX_PHRASE_BANK_SIZE = 500
const UNUSED_LANGUAGE_RETENTION_DAYS = 90

/**
 * Clean up session recaps to keep only the last N entries.
 */
export function cleanupSessionRecaps(): void {
  try {
    const key = 'talkingo_session_recaps'
    const raw = localStorage.getItem(key)
    if (!raw) return

    const recaps = JSON.parse(raw)
    if (!Array.isArray(recaps)) return

    if (recaps.length > MAX_SESSION_RECAPS) {
      const trimmed = recaps.slice(-MAX_SESSION_RECAPS)
      localStorage.setItem(key, JSON.stringify(trimmed))
      console.log(`[Cleanup] Trimmed session recaps from ${recaps.length} to ${trimmed.length}`)
    }
  } catch (error) {
    console.warn('[Cleanup] Failed to clean session recaps:', error)
  }
}

/**
 * Clean up phrase banks to cap at MAX_PHRASE_BANK_SIZE per language.
 */
export function cleanupPhraseBanks(targetLanguages: TargetLanguage[]): void {
  for (const lang of targetLanguages) {
    try {
      const key = `talkingo_phrase_bank_${lang}`
      const raw = localStorage.getItem(key)
      if (!raw) continue

      const phrases = JSON.parse(raw)
      if (!Array.isArray(phrases)) continue

      if (phrases.length > MAX_PHRASE_BANK_SIZE) {
        const trimmed = phrases.slice(-MAX_PHRASE_BANK_SIZE)
        localStorage.setItem(key, JSON.stringify(trimmed))
        console.log(`[Cleanup] Trimmed phrase bank for ${lang} from ${phrases.length} to ${trimmed.length}`)
      }
    } catch (error) {
      console.warn(`[Cleanup] Failed to clean phrase bank for ${lang}:`, error)
    }
  }
}

/**
 * Remove character memory for languages not used in the last N days.
 */
export function cleanupUnusedCharacterMemories(
  activeLanguages: Array<{ personaId: string; targetLanguage: TargetLanguage; lastUsedAt?: number }>
): void {
  const now = Date.now()
  const retentionMs = UNUSED_LANGUAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000

  // Build set of active persona+language combinations
  const activeKeys = new Set(
    activeLanguages.map(al => `${al.personaId}_${al.targetLanguage}`)
  )

  // Check all character memory keys in localStorage
  try {
    const keysToRemove: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith('talkingo_memory_')) continue

      // Extract persona and language from key
      const match = key.match(/^talkingo_memory_(.+)_(.+)$/)
      if (!match) continue

      const [, personaId, targetLanguage] = match
      const comboKey = `${personaId}_${targetLanguage}`

      // Check if this combination is active
      if (!activeKeys.has(comboKey)) {
        // Check last used timestamp
        const raw = localStorage.getItem(key)
        if (raw) {
          try {
            const memory = JSON.parse(raw)
            const lastUsed = memory.lastSessionAt ?? 0
            
            if (now - lastUsed > retentionMs) {
              keysToRemove.push(key)
            }
          } catch {
            // Invalid JSON, remove it
            keysToRemove.push(key)
          }
        }
      }
    }

    // Remove unused memories
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
      console.log(`[Cleanup] Removed unused character memory: ${key}`)
    }
  } catch (error) {
    console.warn('[Cleanup] Failed to clean unused character memories:', error)
  }
}

/**
 * Master cleanup function — call on app initialization.
 */
export function performLocalStorageCleanup(
  activeLanguages: Array<{ personaId: string; targetLanguage: TargetLanguage; lastUsedAt?: number }> = []
): void {
  console.log('[Cleanup] Starting localStorage cleanup...')
  
  cleanupSessionRecaps()
  cleanupPhraseBanks(activeLanguages.map(al => al.targetLanguage))
  
  if (activeLanguages.length > 0) {
    cleanupUnusedCharacterMemories(activeLanguages)
  }

  // Log current localStorage usage
  let totalSize = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('talkingo_')) {
      const value = localStorage.getItem(key)
      totalSize += (key.length + (value?.length ?? 0)) * 2 // UTF-16 encoding
    }
  }
  
  const sizeKB = (totalSize / 1024).toFixed(2)
  console.log(`[Cleanup] Total Talkingo localStorage usage: ${sizeKB} KB`)
}
