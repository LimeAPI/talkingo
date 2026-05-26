/**
 * Chat History — local-only session transcript storage.
 *
 * Saves the last 20 sessions per (personaId × targetLanguage).
 * No cross-device sync — this is a local perk feature.
 * Auto-trims oldest when limit exceeded.
 */

import type { ConversationMessage, PersonaId, TargetLanguage } from '@talkingo/shared/types'

export interface ChatHistorySession {
  sessionId: string
  date: string          // ISO date string
  title: string         // Scenario title or "Free Talk" or "Lesson: X"
  personaId: PersonaId
  targetLanguage: string
  messages: ConversationMessage[]
  durationSeconds: number
}

const MAX_SESSIONS = 20

function storageKey(personaId: PersonaId, targetLanguage: string): string {
  return `talkingo_chat_history_${personaId}_${targetLanguage}`
}

export function saveChatSession(session: ChatHistorySession): void {
  try {
    const key = storageKey(session.personaId, session.targetLanguage)
    const existing = loadChatHistory(session.personaId, session.targetLanguage)

    // Strip audio blobs before saving (too large)
    const stripped: ChatHistorySession = {
      ...session,
      messages: session.messages.map((m) => {
        if (!m.audio) return m
        const { audio: _audio, ...rest } = m
        return rest
      }),
    }

    const updated = [stripped, ...existing].slice(0, MAX_SESSIONS)
    localStorage.setItem(key, JSON.stringify(updated))
  } catch {
    // Ignore quota errors
  }
}

export function loadChatHistory(personaId: PersonaId, targetLanguage: string): ChatHistorySession[] {
  try {
    const raw = localStorage.getItem(storageKey(personaId, targetLanguage))
    if (!raw) return []
    return JSON.parse(raw) as ChatHistorySession[]
  } catch {
    return []
  }
}

export function deleteChatSession(personaId: PersonaId, targetLanguage: string, sessionId: string): void {
  try {
    const existing = loadChatHistory(personaId, targetLanguage)
    const filtered = existing.filter((s) => s.sessionId !== sessionId)
    localStorage.setItem(storageKey(personaId, targetLanguage), JSON.stringify(filtered))
  } catch {
    // Ignore
  }
}

export function clearChatHistory(personaId: PersonaId, targetLanguage: string): void {
  try {
    localStorage.removeItem(storageKey(personaId, targetLanguage))
  } catch {
    // Ignore
  }
}
