'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { signInWithGoogle, signInWithFacebook } from '@/lib/auth/auth'
import { sanitizeRedirectPath } from '@talkingo/shared/utils'
import { motion } from 'framer-motion'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z"/>
    </svg>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = sanitizeRedirectPath(searchParams.get('redirect'), '/')
  const { user, loading } = useAuth()

  if (!loading && user) {
    router.replace(redirect)
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full bg-accent animate-pulse" />
      </div>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-10">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm font-bold text-sm">T</span>
          <span className="text-lg font-bold tracking-tight">Talkingo</span>
        </Link>

        {/* Card */}
        <div className="card-elevated rounded-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-xl font-bold">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-2">Sign in to continue your practice</p>
          </div>

          <div className="space-y-3">
            {/* Facebook — primary */}
            <button
              onClick={() => signInWithFacebook(redirect)}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-full
                         bg-[#1877F2] text-white font-medium text-sm
                         hover:bg-[#166fe0] transition-colors duration-150"
            >
              <FacebookIcon />
              Continue with Facebook
            </button>

            {/* Google */}
            <button
              onClick={() => signInWithGoogle(redirect)}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-full border border-border
                         bg-card hover:bg-muted transition-colors duration-150 text-sm font-medium"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
            We&apos;ll create your account automatically on first sign-in.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          New to Talkingo?{' '}
          <Link href="/signup" className="text-accent font-medium hover:opacity-75">Get started</Link>
        </p>
      </motion.div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-10 h-10 rounded-full bg-accent animate-pulse" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
