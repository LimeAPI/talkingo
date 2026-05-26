'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sendPasswordRecovery } from '@/lib/auth/auth'
import { Loader2, ArrowLeft, Mail } from 'lucide-react'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await sendPasswordRecovery(email)
      setSent(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send recovery email'
      setError(msg.includes('not found') ? 'No account found with this email.' : msg)
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
            Reset your password
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {sent
              ? 'Check your email for a reset link'
              : "Enter your email and we'll send you a recovery link"}
          </p>
        </div>

        <div className="glass-card p-6 sm:p-7">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <Mail className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                We sent a recovery link to <strong className="text-foreground">{email}</strong>.
                Check your inbox (and spam folder).
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="text-xs text-primary hover:underline"
              >
                Didn&apos;t receive it? Try again
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/70">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl bg-background/50 border border-border/60 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                />
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
                Send recovery link
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link href="/login" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
