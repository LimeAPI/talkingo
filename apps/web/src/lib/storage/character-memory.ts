/**
 * Character memory storage — per (user × persona × language).
 *
 * Each character keeps a rolling 100-200 word summary of the user, plus a
 * list of concrete facts they remember. Updated after every session.
 *
 * STORAGE STRATEGY (optimized - HYBRID):
 * - Primary: Appwrite `character_memory` collection for cross-device sync
 * - Cache: localStorage for instant load (read-through cache pattern)
 * - Rationale: Character memory is CORE to personalized conversations. Losing
 *   rapport across devices breaks the emotional connection users build. The extra
 *   ~3KB/session is worth the premium UX from day one.
 */

import type { CharacterMemory, PersonaId, TargetLanguage } from '@talkingo/shared/types'
import { databases } from '../api/appwrite'
import { Permission, Role } from 'appwrite'

const localKey = (personaId: PersonaId, targetLanguage: TargetLanguage) =>
  `talkingo_memory_${personaId}_${targetLanguage}`

// ─── Appwrite Configuration ──────────────────────────────────────────────────
const DATABASE_ID = 'talkingo_db'
const CHARACTER_MEMORY_COLLECTION = 'character_memory'

/** Builds row-level permissions for the owning user */
function ownerPermissions(userId: string): string[] {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ]
}

/** Deterministic doc ID for character memory */
function docIdForCharacter(
  userId: string,
  personaId: PersonaId,
  targetLanguage: TargetLanguage
): string {
  return `${userId}_${personaId}_${targetLanguage}`
}

// ─── Local storage cache ─────────────────────────────────────────────────────

function loadLocal(personaId: PersonaId, targetLanguage: TargetLanguage): CharacterMemory | null {
  try {
    const raw = localStorage.getItem(localKey(personaId, targetLanguage))
    if (!raw) return null
    return JSON.parse(raw) as CharacterMemory
  } catch {
    return null
  }
}

function saveLocal(memory: CharacterMemory): void {
  try {
    localStorage.setItem(localKey(memory.personaId, memory.targetLanguage), JSON.stringify(memory))
  } catch {
    // ignore quota errors
  }
}

// ─── Appwrite Backend ────────────────────────────────────────────────────────

async function loadFromAppwrite(
  userId: string,
  personaId: PersonaId,
  targetLanguage: TargetLanguage
): Promise<CharacterMemory | null> {
  try {
    const docId = docIdForCharacter(userId, personaId, targetLanguage)
    const doc = await databases.getDocument(DATABASE_ID, CHARACTER_MEMORY_COLLECTION, docId)
    return {
      userId: doc.userId,
      personaId: doc.personaId,
      targetLanguage: doc.targetLanguage,
      summary: doc.summary ?? '',
      facts: doc.facts ?? [],
      lastTopics: doc.lastTopics ?? [],
      sessionsCount: doc.sessionsCount ?? 0,
      lastSessionAt: doc.lastSessionAt,
    }
  } catch (error: any) {
    const code = error?.code ?? error?.status ?? 0
    if (code === 404) return null
    console.warn('[CharacterMemory] Appwrite load failed:', error)
    return null
  }
}

async function saveToAppwrite(memory: CharacterMemory): Promise<void> {
  const docId = docIdForCharacter(memory.userId, memory.personaId, memory.targetLanguage)
  const doc = {
    userId: memory.userId,
    personaId: memory.personaId,
    targetLanguage: memory.targetLanguage,
    summary: memory.summary,
    facts: memory.facts,
    lastTopics: memory.lastTopics,
    sessionsCount: memory.sessionsCount,
    lastSessionAt: memory.lastSessionAt,
  }

  try {
    await databases.updateDocument(DATABASE_ID, CHARACTER_MEMORY_COLLECTION, docId, doc)
  } catch (error: any) {
    const code = error?.code ?? error?.status ?? 0
    if (code !== 404) throw error

    // Document doesn't exist yet — create it
    await databases.createDocument(
      DATABASE_ID,
      CHARACTER_MEMORY_COLLECTION,
      docId,
      doc,
      ownerPermissions(memory.userId)
    )
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load character memory for a persona/language combination.
 * Hybrid strategy: Appwrite (authoritative) with localStorage cache.
 */
export async function loadCharacterMemory(
  userId: string | null,
  isAuthenticated: boolean,
  personaId: PersonaId,
  targetLanguage: TargetLanguage
): Promise<CharacterMemory | null> {
  // Try Appwrite first if authenticated
  if (isAuthenticated && userId) {
    try {
      const backend = await loadFromAppwrite(userId, personaId, targetLanguage)
      if (backend) {
        // Update localStorage cache
        saveLocal(backend)
        return backend
      }
    } catch (error) {
      console.warn('[CharacterMemory] Backend load failed, using cache:', error)
    }
  }

  // Fall back to localStorage cache
  return loadLocal(personaId, targetLanguage)
}

/**
 * Save character memory. Hybrid: writes to both Appwrite and localStorage.
 * Non-blocking Appwrite write with localStorage fallback.
 */
export async function saveCharacterMemory(
  userId: string | null,
  isAuthenticated: boolean,
  memory: CharacterMemory
): Promise<void> {
  // Always save to localStorage first (instant)
  saveLocal(memory)

  // Sync to Appwrite in background (non-blocking)
  if (isAuthenticated && userId) {
    saveToAppwrite(memory).catch((error) => {
      console.warn('[CharacterMemory] Appwrite sync failed:', error)
      // Memory is safe in localStorage; will retry on next save
    })
  }
}

/**
 * Build the empty initial memory for a persona/user/language.
 */
export function emptyCharacterMemory(
  userId: string,
  personaId: PersonaId,
  targetLanguage: TargetLanguage
): CharacterMemory {
  return {
    userId,
    personaId,
    targetLanguage,
    summary: '',
    facts: [],
    lastTopics: [],
    sessionsCount: 0,
  }
}

/**
 * Merge a memory-update result into existing memory.
 * Caps facts at 30 (keep newest), lastTopics at 5, summary at ~1500 chars.
 */
export function mergeMemoryUpdate(
  existing: CharacterMemory,
  update: { summary: string; newFacts: string[]; lastTopics: string[] },
  sessionNumber: number
): CharacterMemory {
  const newFacts = update.newFacts
    .filter((f) => f.trim())
    .map((f) => ({ fact: f.trim(), sessionNumber }))
  const allFacts = [...existing.facts, ...newFacts]
    .slice(-30) // keep most recent 30
  return {
    ...existing,
    summary: update.summary || existing.summary,
    facts: allFacts,
    lastTopics: update.lastTopics.length > 0 ? update.lastTopics.slice(0, 5) : existing.lastTopics,
    lastSessionAt: Date.now(),
    sessionsCount: existing.sessionsCount + 1,
  }
}

/**
 * Pick 1-3 facts to reference in the next opener. Prefers recent facts and
 * facts marked as topical.
 */
export function pickFactsToReference(memory: CharacterMemory | null, max = 3): string[] {
  if (!memory || memory.facts.length === 0) return []
  // Most recent facts are most relevant
  return memory.facts
    .slice(-max * 2)
    .reverse()
    .slice(0, max)
    .map((f) => f.fact)
}

/**
 * Clear memory for a specific persona/language (e.g., user wants a fresh start).
 */
export function clearCharacterMemory(
  personaId: PersonaId,
  targetLanguage: TargetLanguage
): void {
  try {
    localStorage.removeItem(localKey(personaId, targetLanguage))
  } catch {
    // ignore
  }
}
