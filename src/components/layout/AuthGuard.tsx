'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { LoadingScreen } from '../ui/LoadingScreen'
import type { AuthUser } from '@/lib/auth/auth'

/**
 * Wraps protected pages. Redirects to /login if not authenticated.
 * Shows a loading screen while the session is being checked.
 *
 * Renders nothing while redirecting so the user never sees a flash of
 * the protected UI before the navigation happens.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!loading && !user) {
      const qs = searchParams.toString()
      const current = qs ? `${pathname}?${qs}` : pathname
      router.replace(`/login?redirect=${encodeURIComponent(current)}`)
    }
  }, [user, loading, pathname, router, searchParams])

  // Still checking session
  if (loading) {
    return <LoadingScreen />
  }

  // Not logged in — render nothing while redirect happens
  if (!user) return <LoadingScreen />

  return <>{children}</>
}

/**
 * Same as `AuthGuard` but exposes a non-null `user` to its render prop.
 * Use this when your component needs to read `user` (which is otherwise
 * typed as `AuthUser | null` from `useAuth`).
 *
 * Example:
 *   <AuthedScreen user={user => <div>{user.email}</div>} />
 */
export function AuthedScreen({ children }: { children: (user: AuthUser) => React.ReactNode }) {
  return (
    <AuthGuard>
      <AuthedInner>{children}</AuthedInner>
    </AuthGuard>
  )
}

function AuthedInner({ children }: { children: (user: AuthUser) => React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <LoadingScreen />
  return <>{children(user)}</>
}
