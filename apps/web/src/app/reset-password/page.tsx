'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { completePasswordRecovery } from '@/lib/auth/auth'
import { Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get('userId') || ''
  const secret = searchParams.get('secret') || ''

  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (!userId || !secret) {
      setError('Invalid recovery link. Please request a new one.')
      return
    }

    setLoading(true)
    try {
      await completePasswordRecovery(userId, secret, password)
      setDone(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password'
      setError(msg.includes('expired') ? 'Recovery link has expired. Please request a new one.' : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex mb-4">
            <TalkingoLogo size="lg" />
          </div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            Set new password
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Choose a strong password for your account
          </p>
        </div>

        <div className="glass-card p-6 sm:p-7">
          {done ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                Password updated. Redirecting to sign in...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/70">New password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    autoComplete="new-password"
                    autoFocus
                    className="w-full px-3 py-2.5 pr-10 rounded-xl bg-background/50 border border-border/60 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-br from-primary via-primary-glow to-secondary text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Reset password
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link href="/login" className="text-primary hover:underline font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
