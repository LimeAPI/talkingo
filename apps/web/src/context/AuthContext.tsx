'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getSession, signOut as authSignOut, type AuthUser } from '@/lib/auth/auth'
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

  const refresh = useCallback(async () => {
    const session = await getSession()
    setUser(session)
  }, [])

  useEffect(() => {
    getSession()
      .then(setUser)
      .finally(() => setLoading(false))
  }, [])

  const signOut = useCallback(async () => {
    await authSignOut()
    setUser(null)
    router.push('/login')
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
