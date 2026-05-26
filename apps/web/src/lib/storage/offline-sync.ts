/**
 * Offline sync buffer for failed Appwrite writes.
 * 
 * When a session-end write fails (network issue, server error), the data is
 * queued in localStorage with a "pending_sync" flag. On next app load or when
 * connectivity is restored, the buffered writes are retried.
 */

import type { LanguageProgress } from '@talkingo/shared/types'
import { saveLanguageProgress } from './appwrite-storage'

const PENDING_SYNC_KEY = 'talkingo_pending_sync'

interface PendingSyncItem {
  type: 'progress' | 'analytics'
  userId: string
  data: any
  timestamp: number
  retryCount: number
}

/**
 * Queue a failed write for later retry.
 */
export function queuePendingSync(item: Omit<PendingSyncItem, 'timestamp' | 'retryCount'>): void {
  try {
    const pending = loadPendingQueue()
    pending.push({
      ...item,
      timestamp: Date.now(),
      retryCount: 0,
    })
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending))
    console.log(`[OfflineSync] Queued ${item.type} for retry (${pending.length} items pending)`)
  } catch (error) {
    console.error('[OfflineSync] Failed to queue pending sync:', error)
  }
}

/**
 * Load all pending sync items from localStorage.
 */
export function loadPendingQueue(): PendingSyncItem[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY)
    if (!raw) return []
    
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Process all pending sync items. Called on app initialization.
 * Retries each item up to 3 times before discarding.
 */
export async function processPendingSyncQueue(): Promise<void> {
  const pending = loadPendingQueue()
  
  if (pending.length === 0) {
    return
  }

  console.log(`[OfflineSync] Processing ${pending.length} pending sync items...`)

  const remaining: PendingSyncItem[] = []

  for (const item of pending) {
    const success = await retrySyncItem(item)
    
    if (!success && item.retryCount < 3) {
      // Keep for next retry
      remaining.push({
        ...item,
        retryCount: item.retryCount + 1,
      })
    } else if (!success) {
      // Discard after 3 failed attempts
      console.warn(`[OfflineSync] Discarding failed sync after 3 retries:`, item)
    }
  }

  // Update queue with remaining items
  if (remaining.length > 0) {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(remaining))
    console.log(`[OfflineSync] ${remaining.length} items still pending`)
  } else {
    localStorage.removeItem(PENDING_SYNC_KEY)
    console.log('[OfflineSync] All pending items synced successfully')
  }
}

/**
 * Retry a single sync item.
 */
async function retrySyncItem(item: PendingSyncItem): Promise<boolean> {
  try {
    switch (item.type) {
      case 'progress':
        await saveLanguageProgress(item.userId, item.data as LanguageProgress)
        console.log('[OfflineSync] Successfully synced progress')
        return true
      
      case 'analytics':
        // Analytics are non-critical, just log and continue
        console.log('[OfflineSync] Skipped analytics sync (non-critical)')
        return true
      
      default:
        console.warn('[OfflineSync] Unknown sync item type:', item.type)
        return false
    }
  } catch (error) {
    console.warn(`[OfflineSync] Retry failed for ${item.type}:`, error)
    return false
  }
}

/**
 * Clear all pending sync items (useful for testing or manual reset).
 */
export function clearPendingSyncQueue(): void {
  localStorage.removeItem(PENDING_SYNC_KEY)
  console.log('[OfflineSync] Cleared pending sync queue')
}

/**
 * Get the count of pending sync items.
 */
export function getPendingSyncCount(): number {
  return loadPendingQueue().length
}
