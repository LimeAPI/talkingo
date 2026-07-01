'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getSession, signOut as authSignOut, type AuthUser } from '@/lib/auth/auth'
import { installAuthFetchInterceptor } from '@/lib/api/auth-fetch'
import { setAppwriteJWT, clearAppwriteJWT } from '@/lib/api/appwrite'
import { useRouter } from 'next/navigation'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Install the fetch interceptor once on mount — ensures all /api/ calls
  // include the Appwrite session token automatically.
  useEffect(() => {
    installAuthFetchInterceptor()
  }, [])

  const refresh = useCallback(async () => {
    const session = await getSession()
    setUser(session)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      setAppwriteJWT()
      const session = await getSession()
      if (!cancelled) {
        setUser(session)
        setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await authSignOut()
    } finally {
      clearAppwriteJWT()
      setUser(null)
      router.push('/login')
    }
  }, [router])

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
