'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { Bug, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'

class SentryExampleFrontendError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SentryExampleFrontendError'
  }
}

/**
 * Sentry verification page. Clicking the button raises both a frontend error
 * and a backend error (via /api/sentry-example-api) inside a traced span, so
 * you can confirm errors + performance data reach your Sentry project.
 *
 * This is a diagnostic page — safe to delete once the integration is verified.
 */
export default function SentryExamplePage() {
  const [hasSentError, setHasSentError] = useState(false)
  const [isConnected, setIsConnected] = useState(true)

  // Detect ad-blockers / network filters that silently drop Sentry requests,
  // so a "nothing happened" result isn't mistaken for a working integration.
  useEffect(() => {
    let active = true
    async function checkConnectivity() {
      const result = await Sentry.diagnoseSdkConnectivity()
      if (active) setIsConnected(result !== 'sentry-unreachable')
    }
    checkConnectivity()
    return () => {
      active = false
    }
  }, [])

  const triggerError = async () => {
    // Verify the browser can actually reach Sentry (ad-blockers often block it).
    await Sentry.startSpan(
      { name: 'Example Frontend/Backend Span', op: 'test' },
      async () => {
        const res = await fetch('/api/sentry-example-api')
        if (!res.ok) {
          setHasSentError(true)
        }
        throw new SentryExampleFrontendError(
          'This error is raised on the frontend of the example page.',
        )
      },
    )
  }

  return (
    <main className="lp min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />

      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-32 text-center">
        <div className="lp-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="lp-mesh opacity-50" aria-hidden />

        <div className="relative max-w-md">
          <p className="lp-eyebrow justify-center">Diagnostics</p>
          <h1 className="mt-6 font-display text-3xl font-semibold tracking-[-.04em] text-[oklch(var(--color-ink))]">
            Sentry test error
          </h1>
          <p className="mx-auto mt-3 max-w-[42ch] text-[14px] leading-relaxed text-[oklch(var(--color-muted))]">
            Trigger a sample error to confirm it reaches your Sentry project. This
            fires an error on both the client and the server.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                triggerError().catch(() => setHasSentError(true))
              }}
              disabled={!isConnected}
              className="lp-btn lp-btn--primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Bug className="h-4 w-4" /> Throw sample error
            </button>
            <Link href="/" className="lp-btn lp-btn--ghost">
              <ArrowLeft className="h-4 w-4" /> Back home
            </Link>
          </div>

          {hasSentError ? (
            <p className="mt-6 inline-flex items-center justify-center gap-2 text-[13px] text-[oklch(var(--color-muted))]">
              <CheckCircle2 className="h-4 w-4 text-[oklch(var(--color-accent))]" />
              Error sent — check the Issues stream in your Sentry dashboard.
            </p>
          ) : !isConnected ? (
            <p className="mt-6 inline-flex items-center justify-center gap-2 text-[13px] text-[oklch(var(--color-muted))]">
              <AlertTriangle className="h-4 w-4" />
              Network requests to Sentry are being blocked (likely an ad-blocker).
            </p>
          ) : null}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
