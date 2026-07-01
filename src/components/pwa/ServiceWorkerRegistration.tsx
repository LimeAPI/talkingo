'use client'

import { useEffect } from 'react'

/**
 * Service Worker Registration & Update Handler
 * 
 * Handles SW lifecycle events including:
 * - Registration
 * - Update detection
 * - Prompting user to reload for updates
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      process.env.NODE_ENV === 'development'
    ) {
      return
    }

    // The SW is auto-registered by next-pwa, but we add update handling
    const handleSWUpdate = async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) return

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content available, show update notification
            if (confirm('A new version of Talkingo is available. Reload to update?')) {
              newWorker.postMessage({ type: 'SKIP_WAITING' })
              window.location.reload()
            }
          }
        })
      })
    }

    handleSWUpdate()

    // Handle controller change (when skipWaiting is called)
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })
  }, [])

  return null
}
