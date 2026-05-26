'use client'

import { useEffect } from 'react'
import { performLocalStorageCleanup } from '@/lib/storage/local-storage-cleanup'
import { processPendingSyncQueue } from '@/lib/storage/offline-sync'

/**
 * Runs localStorage cleanup and offline sync on app initialization.
 * This is a no-render component — it only executes side effects.
 */
export function StorageCleanup() {
  useEffect(() => {
    // Run cleanup once on mount
    performLocalStorageCleanup()
    
    // Process any pending offline syncs
    processPendingSyncQueue().catch(error => {
      console.error('[StorageCleanup] Failed to process pending syncs:', error)
    })
  }, [])

  return null
}
