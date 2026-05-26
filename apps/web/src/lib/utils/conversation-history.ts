import type { ConversationMessage, ConversationState } from '@talkingo/shared/types'

export interface SavedConversation {
  id: string
  timestamp: number
  duration: number // in seconds
  messages: ConversationMessage[]
  state: ConversationState
  topic: string
  level: string
}

const MAX_SAVED_CONVERSATIONS = 50

// Scoped per user so two accounts on the same device never share history
const storageKey = (userId: string | null) =>
  `talkingo_conversations_${userId || 'anon'}`

/**
 * Save a conversation to localStorage (scoped to userId)
 */
export function saveConversation(
  conversation: Omit<SavedConversation, 'id' | 'timestamp'>,
  userId: string | null = null
): SavedConversation {
  const saved: SavedConversation = {
    ...conversation,
    id: Date.now().toString(),
    timestamp: Date.now(),
  }

  try {
    const existing = getConversations(userId)
    const updated = [saved, ...existing].slice(0, MAX_SAVED_CONVERSATIONS)
    localStorage.setItem(storageKey(userId), JSON.stringify(updated))
    console.log('[ConversationHistory] Saved conversation:', saved.id)
  } catch (error) {
    console.error('[ConversationHistory] Failed to save conversation:', error)
  }

  return saved
}

/**
 * Get all saved conversations for a user
 */
export function getConversations(userId: string | null = null): SavedConversation[] {
  try {
    const data = localStorage.getItem(storageKey(userId))
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('[ConversationHistory] Failed to load conversations:', error)
    return []
  }
}

/**
 * Get a specific conversation by ID
 */
export function getConversationById(id: string, userId: string | null = null): SavedConversation | null {
  try {
    const conversations = getConversations(userId)
    return conversations.find(c => c.id === id) || null
  } catch (error) {
    console.error('[ConversationHistory] Failed to get conversation:', error)
    return null
  }
}

/**
 * Delete a conversation by ID
 */
export function deleteConversation(id: string, userId: string | null = null): boolean {
  try {
    const conversations = getConversations(userId)
    const updated = conversations.filter(c => c.id !== id)
    localStorage.setItem(storageKey(userId), JSON.stringify(updated))
    console.log('[ConversationHistory] Deleted conversation:', id)
    return true
  } catch (error) {
    console.error('[ConversationHistory] Failed to delete conversation:', error)
    return false
  }
}

/**
 * Clear all conversations for a user
 */
export function clearAllConversations(userId: string | null = null): void {
  try {
    localStorage.removeItem(storageKey(userId))
    console.log('[ConversationHistory] Cleared all conversations')
  } catch (error) {
    console.error('[ConversationHistory] Failed to clear conversations:', error)
  }
}

/**
 * Format duration from seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format timestamp to readable date
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}
