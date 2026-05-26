import type { PersonaId, TargetLanguage } from '@talkingo/shared/types'

/**
 * Conversation memory stored in localStorage for continuity across sessions.
 * Each memory is keyed by userId + personaId + targetLanguage combination.
 */
export interface ConversationMemory {
  userId: string
  personaId: PersonaId
  targetLanguage: TargetLanguage
  lastScenarioId?: string
  lastTopics: string[]
  userFacts: string[]  // e.g., ["has a dog named Max", "learning for travel"]
  conversationSummary: string  // Rolling 100-word summary
  lastSessionAt: number
  totalSessions: number
}

const MEMORY_KEY = 'talkingo_conversation_memory'

/**
 * Load memory for a specific user/persona/language combination
 */
export function loadMemory(
  userId: string,
  personaId: PersonaId,
  targetLanguage: TargetLanguage
): ConversationMemory | null {
  try {
    const allMemories = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}')
    const key = `${userId}_${personaId}_${targetLanguage}`
    return allMemories[key] || null
  } catch (error) {
    console.error('[Memory] Failed to load:', error)
    return null
  }
}

/**
 * Save or update memory for a specific user/persona/language combination
 */
export function saveMemory(memory: ConversationMemory): void {
  try {
    const allMemories = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}')
    const key = `${memory.userId}_${memory.personaId}_${memory.targetLanguage}`
    allMemories[key] = memory
    localStorage.setItem(MEMORY_KEY, JSON.stringify(allMemories))
  } catch (error) {
    console.error('[Memory] Failed to save:', error)
  }
}

/**
 * Clear memory for a specific user/persona/language combination
 */
export function clearMemory(
  userId: string,
  personaId: PersonaId,
  targetLanguage: TargetLanguage
): void {
  try {
    const allMemories = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}')
    const key = `${userId}_${personaId}_${targetLanguage}`
    delete allMemories[key]
    localStorage.setItem(MEMORY_KEY, JSON.stringify(allMemories))
  } catch (error) {
    console.error('[Memory] Failed to clear:', error)
  }
}

/**
 * Check if there's any previous session for this user/persona/language
 */
export function hasPreviousSession(
  userId: string,
  personaId: PersonaId,
  targetLanguage: TargetLanguage
): boolean {
  const memory = loadMemory(userId, personaId, targetLanguage)
  return memory !== null && memory.totalSessions > 0
}

/**
 * Get the most recent memory across all personas/languages for a user
 * (useful for showing "Continue" button on home screen)
 */
export function getMostRecentMemory(userId: string): ConversationMemory | null {
  try {
    const allMemories = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}')
    
    let mostRecent: ConversationMemory | null = null
    
    for (const key in allMemories) {
      const memory = allMemories[key]
      if (memory.userId === userId) {
        if (!mostRecent || memory.lastSessionAt > mostRecent.lastSessionAt) {
          mostRecent = memory
        }
      }
    }
    
    return mostRecent
  } catch (error) {
    console.error('[Memory] Failed to get most recent:', error)
    return null
  }
}
