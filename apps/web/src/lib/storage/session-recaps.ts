/**
 * Session recaps storage — localStorage only.
 *
 * Keeps the last 10 session recaps per user for display on the home screen.
 * Recaps are generated at session end (96% compression of full transcript).
 *
 * STORAGE STRATEGY:
 * - localStorage ONLY. No Appwrite sync.
 * - Rationale: Users rarely review old recaps. Saves significant DB writes.
 *   Can upgrade to Appwrite collection later if "session history" feature is requested.
 */

import type { SessionRecap, TargetLanguage } from '@talkingo/shared/types'

const MAX_RECAPS = 10

export interface StoredRecap {
  /** Unique ID (timestamp-based) */
  id: string
  /** When the session ended */
  date: number
  /** Language this session was in */
  languageId: TargetLanguage
  /** The full recap object */
  recap: SessionRecap
  /** Session duration in seconds */
  duration: number
  /** Persona used */
  personaId?: string
}

const storageKey = (userId: string | null) =>
  `talkingo_session_recaps_${userId || 'anon'}`

/**
 * Save a recap after session end. Keeps only the last MAX_RECAPS.
 */
export function saveSessionRecap(
  userId: string | null,
  recap: SessionRecap,
  languageId: TargetLanguage,
  personaId?: string
): StoredRecap {
  const stored: StoredRecap = {
    id: Date.now().toString(),
    date: Date.now(),
    languageId,
    recap,
    duration: recap.durationSeconds,
    personaId,
  }

  try {
    const existing = getSessionRecaps(userId)
    const updated = [stored, ...existing].slice(0, MAX_RECAPS)
    localStorage.setItem(storageKey(userId), JSON.stringify(updated))
  } catch (error) {
    console.warn('[session-recaps] Failed to save:', error)
  }

  return stored
}

/**
 * Get all stored recaps for a user (most recent first).
 */
export function getSessionRecaps(userId: string | null): StoredRecap[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Get the most recent recap (for "last session" display on home screen).
 */
export function getLastRecap(userId: string | null): StoredRecap | null {
  const recaps = getSessionRecaps(userId)
  return recaps.length > 0 ? recaps[0] : null
}

/**
 * Clear all recaps for a user.
 */
export function clearSessionRecaps(userId: string | null): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // ignore
  }
}
