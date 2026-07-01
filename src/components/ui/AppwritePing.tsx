'use client'

import { useEffect } from 'react'
import { client } from '@/lib/api/appwrite'

/**
 * Pings the Appwrite backend on app load to verify the connection.
 * Logs the result to the console — no UI impact.
 */
export function AppwritePing() {
  useEffect(() => {
    client.ping()
      .then(() => console.log('[Appwrite] ✓ Connected to https://fra.cloud.appwrite.io/v1'))
      .catch((err) => console.error('[Appwrite] ✗ Ping failed:', err))
  }, [])

  return null
}
