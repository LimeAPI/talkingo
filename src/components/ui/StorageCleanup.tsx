'use client'

import { useEffect } from 'react'
import { performLocalStorageCleanup } from '@/lib/storage/local-storage-cleanup'

/**
 * Runs localStorage cleanup on app initialization.
 * This is a no-render component — it only executes side effects.
 */
export function StorageCleanup() {
  useEffect(() => {
    performLocalStorageCleanup()
  }, [])

  return null
}
