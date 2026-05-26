'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { TalkingoLogo } from '../ui/TalkingoLogo'

/**
 * Wraps protected pages. Redirects to /login if not authenticated.
 * Shows a loading screen while the session is being checked.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  // Still checking session
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-8">
        {/* Logo */}
        <TalkingoLogo size="xl" />
        
        {/* Cloudflare-style loading bar */}
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary via-primary-glow to-primary animate-loading-slide rounded-full" />
        </div>
        
        <p className="text-sm text-muted-foreground font-medium">Loading Talkingo…</p>
      </div>
    )
  }

  // Not logged in — render nothing while redirect happens
  if (!user) return null

  return <>{children}</>
}
