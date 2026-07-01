'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Lock, CheckCircle2, AlertCircle } from 'lucide-react'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'
import { completePasswordRecovery } from '@/lib/auth/auth'

function ResetFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-[oklch(var(--color-accent,52%_.19_265))]" />
    </div>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()

  // Appwrite recovery links arrive as ?userId=...&secret=...
  const userId = params.get('userId') ?? ''
  const secret = params.get('secret') ?? ''
  const linkValid = Boolean(userId && secret)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords don’t match.')
      return
    }

    setPending(true)
    try {
      await completePasswordRecovery(userId, secret, password)
      setDone(true)
      // Give the success state a moment, then send them to sign in.
      setTimeout(() => router.replace('/login'), 2200)
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? 'This reset link is invalid or has expired. Please request a new one.'
          : 'Something went wrong. Please try again.',
      )
      setPending(false)
    }
  }

  return (
    <main className="lp lp-auth bg-background text-foreground">
      <section className="lp-auth__panel">
        <div className="lp-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="lp-mesh opacity-50" aria-hidden />

        <Link
          href="/login"
          className="absolute left-5 top-5 inline-flex items-center gap-1.5 text-[13px] font-medium
                     text-[oklch(var(--color-muted))] hover:text-[oklch(var(--color-ink))] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>

        <div className="lp-auth-card relative">
          <Link href="/" className="flex items-center justify-center gap-2.5 mb-9">
            <TalkingoLogo size="md" />
            <span className="font-display text-xl font-semibold tracking-tight">Talkingo</span>
          </Link>

          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-[oklch(var(--color-success))]" />
              <h1 className="mt-4 font-display text-[1.7rem] font-semibold tracking-[-.03em] text-[oklch(var(--color-ink))]">
                Password updated
              </h1>
              <p className="mt-2 text-[14px] text-[oklch(var(--color-muted))]">
                You can now sign in with your new password. Taking you there…
              </p>
            </div>
          ) : !linkValid ? (
            <div className="text-center">
              <AlertCircle className="mx-auto h-10 w-10 text-[oklch(58%_.15_45)]" />
              <h1 className="mt-4 font-display text-[1.7rem] font-semibold tracking-[-.03em] text-[oklch(var(--color-ink))]">
                Invalid reset link
              </h1>
              <p className="mt-2 text-[14px] text-[oklch(var(--color-muted))]">
                This link is missing required information or has expired. Please request a new
                password reset.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block font-semibold text-[oklch(var(--color-accent-dim))] hover:text-[oklch(var(--color-accent))] transition-colors"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-7">
                <h1 className="font-display text-[1.7rem] font-semibold tracking-[-.03em] text-[oklch(var(--color-ink))]">
                  Set a new password
                </h1>
                <p className="mt-2 text-[14px] text-[oklch(var(--color-muted))]">
                  Choose a strong password you don’t use elsewhere.
                </p>
              </div>

              {error && (
                <div className="lp-alert mb-5" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-[oklch(var(--color-ink))]">
                    New password
                  </span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[oklch(var(--color-muted))]" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full rounded-xl border border-[oklch(var(--color-rule))] bg-[oklch(var(--color-paper)/.5)] py-2.5 pl-9 pr-3 text-[14px] text-[oklch(var(--color-ink))] outline-none focus:border-[oklch(var(--color-accent))] transition-colors"
                      placeholder="At least 8 characters"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-[oklch(var(--color-ink))]">
                    Confirm password
                  </span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[oklch(var(--color-muted))]" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={8}
                      className="w-full rounded-xl border border-[oklch(var(--color-rule))] bg-[oklch(var(--color-paper)/.5)] py-2.5 pl-9 pr-3 text-[14px] text-[oklch(var(--color-ink))] outline-none focus:border-[oklch(var(--color-accent))] transition-colors"
                      placeholder="Re-enter your password"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={pending}
                  className="lp-oauth lp-oauth--google w-full justify-center"
                >
                  {pending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : null}
                  {pending ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetFallback />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
