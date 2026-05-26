/**
 * Phrase bank storage — "Steal This Phrase".
 *
 * For every vocab item the AI introduces, we also keep the full sentence,
 * which character said it, and what the user had said right before. The
 * user can browse this like a scrapbook.
 *
 * STORAGE STRATEGY (optimized):
 * - localStorage ONLY. No Appwrite sync.
 * - Rationale: Phrases are auto-extracted from sessions and cheap to regenerate.
 *   Saving a collection + per-phrase writes is wasteful. Capped at 500 per language.
 *   Multi-device sync can be added later as a premium feature.
 */

import type {
  TrackedPhrase,
  ConversationMessage,
  PersonaId,
  TargetLanguage,
  VocabItem,
} from '@talkingo/shared/types'

const localKey = (targetLanguage: TargetLanguage) => `talkingo_phrases_${targetLanguage}`

// ─── Local storage ───────────────────────────────────────────────────────────

function loadLocal(targetLanguage: TargetLanguage): TrackedPhrase[] {
  try {
    const raw = localStorage.getItem(localKey(targetLanguage))
    return raw ? (JSON.parse(raw) as TrackedPhrase[]) : []
  } catch {
    return []
  }
}

function saveLocal(targetLanguage: TargetLanguage, phrases: TrackedPhrase[]): void {
  try {
    // Cap at 500 per language
    const trimmed = phrases.slice(-500)
    localStorage.setItem(localKey(targetLanguage), JSON.stringify(trimmed))
  } catch {
    // ignore quota errors
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load all tracked phrases for a language. localStorage-only — instant.
 */
export async function loadPhrases(
  _userId: string | null,
  _isAuthenticated: boolean,
  targetLanguage: TargetLanguage
): Promise<TrackedPhrase[]> {
  return loadLocal(targetLanguage)
}

/**
 * Extract and save phrases from a completed session.
 * Deduplicates by phrase ID, merges into existing bank.
 */
export async function addPhrasesFromSession(
  _userId: string | null,
  _isAuthenticated: boolean,
  targetLanguage: TargetLanguage,
  messages: ConversationMessage[],
  characterId: PersonaId,
  seedId: string
): Promise<TrackedPhrase[]> {
  const newPhrases: TrackedPhrase[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.isUser) continue
    const vocab: VocabItem[] = msg.vocab ?? []
    if (vocab.length === 0) continue

    // Find the user's turn that immediately preceded this AI message
    const userPrev = [...messages.slice(0, i)].reverse().find((m) => m.isUser)?.text

    for (const v of vocab) {
      newPhrases.push({
        id: `${msg.id}-${v.term.toLowerCase()}`,
        fullSentence: msg.text,
        highlightTerm: v.term,
        gloss: v.gloss,
        characterId,
        seedId,
        userTurnBefore: userPrev,
        isFavorite: false,
        addedAt: Date.now(),
        replayCount: 0,
      })
    }
  }

  if (newPhrases.length === 0) return []

  // Merge into local store, dedup by id
  const existing = loadLocal(targetLanguage)
  const seen = new Set(existing.map((p) => p.id))
  const merged = [...existing, ...newPhrases.filter((p) => !seen.has(p.id))]
  saveLocal(targetLanguage, merged)

  return newPhrases
}

/**
 * Toggle favorite status for a phrase.
 */
export function toggleFavorite(
  targetLanguage: TargetLanguage,
  phraseId: string
): TrackedPhrase[] {
  const all = loadLocal(targetLanguage)
  const updated = all.map((p) =>
    p.id === phraseId ? { ...p, isFavorite: !p.isFavorite } : p
  )
  saveLocal(targetLanguage, updated)
  return updated
}

/**
 * Record a replay of a phrase (for SRS tracking).
 */
export function recordReplay(
  targetLanguage: TargetLanguage,
  phraseId: string
): void {
  const all = loadLocal(targetLanguage)
  const updated = all.map((p) =>
    p.id === phraseId
      ? { ...p, replayCount: p.replayCount + 1, lastReplayedAt: Date.now() }
      : p
  )
  saveLocal(targetLanguage, updated)
}

/**
 * Delete a phrase from the bank.
 */
export function deletePhrase(
  targetLanguage: TargetLanguage,
  phraseId: string
): TrackedPhrase[] {
  const all = loadLocal(targetLanguage)
  const updated = all.filter((p) => p.id !== phraseId)
  saveLocal(targetLanguage, updated)
  return updated
}

/**
 * Clear all phrases for a language.
 */
export function clearPhrases(targetLanguage: TargetLanguage): void {
  try {
    localStorage.removeItem(localKey(targetLanguage))
  } catch {
    // ignore
  }
}
