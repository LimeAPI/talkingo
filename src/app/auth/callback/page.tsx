'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/auth/auth'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { sanitizeRedirectPath } from '@talkingo/shared/utils'

const MAX_ATTEMPTS = 25
const BASE_DELAY = 300

function OAuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = sanitizeRedirectPath(searchParams.get('redirect'), '/')
  const [attempt, setAttempt] = useState(0)
  const resolvedRef = useRef(false)

  useEffect(() => {
    if (resolvedRef.current) return
    if (attempt > MAX_ATTEMPTS) {
      resolvedRef.current = true
      router.replace(`/login?error=oauth_timeout`)
      return
    }

    let cancelled = false

    const check = async () => {
      try {
        const user = await getSession()
        if (cancelled) return
        if (user) {
          resolvedRef.current = true
          router.replace(redirect)
          return
        }
        const delay = Math.min(BASE_DELAY * (attempt + 1), 3000)
        setTimeout(() => {
          if (!cancelled) setAttempt((a) => a + 1)
        }, delay)
      } catch {
        if (!cancelled) {
          setTimeout(() => {
            if (!cancelled) setAttempt((a) => a + 1)
          }, BASE_DELAY * (attempt + 1))
        }
      }
    }

    check()
    return () => { cancelled = true }
  }, [attempt, redirect, router])

  return <LoadingScreen />
}

export default function OAuthCallback() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OAuthCallbackInner />
    </Suspense>
  )
}
