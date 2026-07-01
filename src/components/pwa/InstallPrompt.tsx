'use client'

import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * PWA Install Prompt Component
 * 
 * Shows a native-feeling install banner when the browser triggers
 * the beforeinstallprompt event. Handles both the banner UI and
 * the actual installation flow.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    // Check if user previously dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10)
      // Show again after 7 days
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) {
        return
      }
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Small delay so it doesn't appear immediately on page load
      setTimeout(() => setShowBanner(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowBanner(false)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setShowBanner(false)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setShowBanner(false)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }, [])

  if (isInstalled || !showBanner) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] animate-in slide-in-from-bottom-4 duration-300 md:left-auto md:right-4 md:max-w-sm">
      <div className="rounded-2xl bg-white dark:bg-[hsl(260,30%,14%)] border border-[hsl(30,18%,88%)] dark:border-[hsl(260,20%,22%)] shadow-2xl shadow-black/10 dark:shadow-black/40 p-4">
        <div className="flex items-start gap-3">
          {/* App Icon */}
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <svg viewBox="0 0 120 120" className="w-8 h-8">
              <path d="M35 32H85M60 32V96" stroke="white" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[hsl(240,24%,10%)] dark:text-white text-sm">
              Install Talkingo
            </h3>
            <p className="text-xs text-[hsl(240,8%,44%)] dark:text-[hsl(240,8%,70%)] mt-0.5">
              Add to your home screen for the best experience
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-[hsl(30,20%,94%)] dark:hover:bg-[hsl(260,20%,20%)] transition-colors"
            aria-label="Dismiss install prompt"
          >
            <svg className="w-4 h-4 text-[hsl(240,8%,44%)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleDismiss}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-xl text-[hsl(240,8%,44%)] dark:text-[hsl(240,8%,70%)] hover:bg-[hsl(30,20%,94%)] dark:hover:bg-[hsl(260,20%,20%)] transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 px-4 py-2 text-sm font-semibold rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/30 active:scale-95 transition-all"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
