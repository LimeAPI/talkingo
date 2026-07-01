'use client'

/* Premium split-screen auth shell — shared by /login and /signup.
 * Left: OAuth card. Right: branded dark "room" matching the landing.
 * Gold-scoped via .lp. OAuth-only (Google + Facebook); Google is primary. */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2, Sparkles, AlertCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { signInWithGoogle, signInWithFacebook } from '@/lib/auth/auth'
import { sanitizeRedirectPath } from '@talkingo/shared/utils'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'

type Provider = 'google' | 'facebook'

const ERROR_COPY: Record<string, string> = {
  google_denied: 'Google sign-in was cancelled. Want to try again?',
  facebook_denied: 'Facebook sign-in was cancelled. Want to try again?',
  oauth_state: 'Your sign-in session expired. Please try again.',
  oauth_no_code: 'Something interrupted sign-in. Please try again.',
  oauth_failed: 'We couldn’t sign you in just now. Please try again.',
  oauth_timeout: 'Sign-in took too long to confirm. Please try again.',
  oauth_not_configured: 'Sign-in is temporarily unavailable. Please try again later.',
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" fill="currentColor">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z" />
    </svg>
  )
}

export function AuthShell({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reduce = useReducedMotion()
  const { user, loading } = useAuth()

  const redirect = sanitizeRedirectPath(searchParams.get('redirect'), '/')
  const errorCode = searchParams.get('error')
  const [pending, setPending] = useState<Provider | null>(null)

  if (!loading && user) {
    router.replace(redirect)
    return null
  }

  if (loading) {
    return (
      <div className="lp min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-[oklch(var(--color-accent))]" />
      </div>
    )
  }

  const isLogin = mode === 'login'
  const start = (p: Provider) => {
    if (pending) return
    setPending(p)
    if (p === 'google') signInWithGoogle(redirect)
    else signInWithFacebook(redirect)
  }

  const fade = reduce ? {} : {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  }

  return (
    <main className="lp lp-auth bg-background text-foreground">
      {/* ── Left: auth card ── */}
      <section className="lp-auth__panel">
        <div className="lp-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="lp-mesh opacity-50" aria-hidden />

        <Link
          href="/"
          className="absolute left-5 top-5 inline-flex items-center gap-1.5 text-[13px] font-medium
                     text-[oklch(var(--color-muted))] hover:text-[oklch(var(--color-ink))] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>

        <motion.div {...fade} className="lp-auth-card relative">
          <Link href="/" className="flex items-center justify-center gap-2.5 mb-9">
            <TalkingoLogo size="md" />
            <span className="font-display text-xl font-semibold tracking-tight">Talkingo</span>
          </Link>

          <div className="text-center mb-7">
            <h1 className="font-display text-[1.7rem] font-semibold tracking-[-.03em] text-[oklch(var(--color-ink))]">
              {isLogin ? 'Welcome back' : 'Start speaking today'}
            </h1>
            <p className="mt-2 text-[14px] text-[oklch(var(--color-muted))]">
              {isLogin
                ? 'Pick up your conversations right where you left off.'
                : 'Create your account in seconds — no password to remember.'}
            </p>
          </div>

          {errorCode && (
            <div className="lp-alert mb-5" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
              <span>{ERROR_COPY[errorCode] ?? 'Something went wrong. Please try again.'}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => start('google')}
              disabled={!!pending}
              className="lp-oauth lp-oauth--google"
            >
              {pending === 'google' ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <GoogleIcon />}
              {pending === 'google' ? 'Redirecting…' : isLogin ? 'Continue with Google' : 'Sign up with Google'}
            </button>

            <button
              onClick={() => start('facebook')}
              disabled={!!pending}
              className="lp-oauth lp-oauth--fb"
            >
              {pending === 'facebook' ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <FacebookIcon />}
              {pending === 'facebook' ? 'Redirecting…' : isLogin ? 'Continue with Facebook' : 'Sign up with Facebook'}
            </button>
          </div>

          {!isLogin && (
            <div className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-[oklch(var(--color-muted))]">
              <Sparkles className="h-3.5 w-3.5 text-[oklch(var(--color-accent-dim))]" />
              5-day trial · cancel anytime
            </div>
          )}

          <div className="lp-divider my-6"><span>Secure sign-in</span></div>

          <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-[oklch(var(--color-muted))] leading-relaxed">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[oklch(var(--color-success))]" />
            {isLogin ? 'We never post anything or store passwords.' : 'We’ll set everything up automatically on first sign-in.'}
          </p>

          <p className="mt-7 text-center text-[14px] text-[oklch(var(--color-muted))]">
            {isLogin ? 'New to Talkingo? ' : 'Already have an account? '}
            <Link
              href={isLogin ? '/signup' : '/login'}
              className="font-semibold text-[oklch(var(--color-accent-dim))] hover:text-[oklch(var(--color-accent))] transition-colors"
            >
              {isLogin ? 'Create an account' : 'Sign in'}
            </Link>
          </p>

          <p className="mt-6 text-center text-[11px] text-[oklch(var(--color-muted))] leading-relaxed">
            By continuing you agree to our{' '}
            <Link href="/terms" className="underline underline-offset-2 hover:text-[oklch(var(--color-ink))]">Terms</Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-[oklch(var(--color-ink))]">Privacy Policy</Link>.
          </p>
        </motion.div>
      </section>

      {/* ── Right: branded dark room ── */}
      <aside className="lp-auth__aside lp-dark">
        <div className="lp-mesh opacity-80" aria-hidden />
        <div className="lp-dotgrid absolute inset-0 opacity-40" aria-hidden />

        <div className="relative flex items-center gap-2.5">
          <TalkingoLogo size="sm" />
          <span className="text-[13px] font-semibold tracking-tight">Talkingo</span>
        </div>

        <div className="relative max-w-md">
          <span className="lp-eyebrow">AI language tutors</span>
          <p className="lp-statement mt-6 text-[clamp(2rem,3.4vw,2.9rem)]">
            Speak a new language
            <br /><span className="text-[oklch(var(--color-accent))]">from day one.</span>
          </p>
          <p className="mt-6 max-w-[42ch] text-[15px] leading-relaxed text-[oklch(var(--color-muted))]">
            Real conversations with AI tutors in 30 languages — instant corrections,
            natural speech, zero drills.
          </p>

          {/* mini correction proof, echoing the landing demo */}
          <div className="mt-9 rounded-2xl border border-[oklch(var(--color-rule))] bg-[oklch(var(--color-paper)/.5)] p-4 backdrop-blur-sm">
            <div className="self-end rounded-lg rounded-br-sm bg-[oklch(var(--color-accent)/.12)] px-3 py-2 text-[13px] text-[oklch(var(--color-ink))]">
              Soy de Estados Unidos. Aprendo español.
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-[13px]">
              <span className="rounded bg-[oklch(58%_.15_45/.15)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[oklch(70%_.14_50)]">grammar</span>
              <span className="line-through opacity-50">Aprendo</span>
              <ArrowRight className="h-3 w-3 text-[oklch(var(--color-accent)/.7)]" />
              <span className="font-semibold text-[oklch(var(--color-accent))]">Estoy aprendiendo</span>
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-8">
          {[
            { v: '30', l: 'Languages' },
            { v: '6', l: 'AI Tutors' },
            { v: '12', l: 'Levels' },
          ].map(s => (
            <div key={s.l}>
              <div className="font-[var(--font-outlier)] text-2xl font-semibold tracking-tight text-[oklch(var(--color-ink))]">{s.v}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[.16em] text-[oklch(var(--color-muted))]">{s.l}</div>
            </div>
          ))}
        </div>
      </aside>
    </main>
  )
}
